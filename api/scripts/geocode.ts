/**
 * Geocodificador por lotes.
 *
 * Lee los contactos cuyas notas tienen el bloque del padrón electoral
 * (PROVINCIA/CANTÓN/PARROQUIA/RECINTO), arma una consulta y la resuelve contra
 * Nominatim (OpenStreetMap). Asigna el punto al contacto (a nivel zona).
 *
 * Uso:
 *   npx tsx scripts/geocode.ts          # geocodifica y guarda
 *   npx tsx scripts/geocode.ts --dry    # solo muestra qué haría (no escribe)
 *
 * Respeta la política de Nominatim: User-Agent propio + 1 req/seg.
 */
import "dotenv/config";
import { pool, query } from "../src/db.js";

const DRY = process.argv.includes("--dry");
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "trenmap/0.1 (geocoder; contacto: k4ento@gmail.com)";
const SLEEP_MS = 1100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extrae un campo "ETIQUETA: valor" de la nota (multilínea o de una línea).
function field(note: string, labels: string[]): string | null {
  for (const label of labels) {
    const m = note.match(new RegExp(`${label}\\s*:\\s*([^\\n/]*)`, "i"));
    if (m) {
      // corta en separadores del formato de una línea ("X - CIUDAD ...")
      const val = m[1].split(/\s+-\s+|\s{2,}/)[0].trim();
      if (val && !/^null$/i.test(val)) return val;
    }
  }
  return null;
}

interface Parsed {
  recinto: string | null;
  direccion: string | null;
  parroquia: string | null;
  canton: string | null;
  provincia: string | null;
}

function parse(note: string): Parsed {
  return {
    recinto: field(note, ["RECINTO"]),
    direccion: field(note, ["DIRECCIÓN", "DIRECCION"]),
    parroquia: field(note, ["PARROQUIA"]),
    canton: field(note, ["CANTÓN", "CANTON"]),
    provincia: field(note, ["PROVINCIA"]),
  };
}

// Consultas de más específica a más general; nos quedamos con el primer acierto.
function queries(p: Parsed): string[] {
  const c = (parts: (string | null)[]) => parts.filter(Boolean).join(", ");
  return [
    c([p.recinto, p.parroquia, p.canton, p.provincia, "Ecuador"]),
    c([p.parroquia, p.canton, p.provincia, "Ecuador"]),
    c([p.canton, p.provincia, "Ecuador"]),
  ].filter((q, i, a) => q && a.indexOf(q) === i);
}

// Provincias del padrón que en realidad son países (voto en el exterior):
// para esas NO restringimos a Ecuador.
const FOREIGN = new Set([
  "ESPAÑA",
  "ESTADOS UNIDOS DE AMÉRICA",
  "ESTADOS UNIDOS",
  "ITALIA",
  "REINO UNIDO",
  "ALEMANIA",
  "FRANCIA",
  "CANADÁ",
  "CHILE",
]);

const cache = new Map<string, { lng: number; lat: number; display: string } | null>();

async function geocodeOne(q: string, restrictEc = true) {
  const key = `${restrictEc ? "ec" : "xx"}:${q}`;
  if (cache.has(key)) return cache.get(key)!;
  const cc = restrictEc ? "&countrycodes=ec" : "";
  const url = `${NOMINATIM}?format=jsonv2&limit=1${cc}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  await sleep(SLEEP_MS); // throttle obligatorio
  if (!res.ok) {
    cache.set(key, null);
    return null;
  }
  const arr = (await res.json()) as any[];
  const hit = arr[0]
    ? { lng: Number(arr[0].lon), lat: Number(arr[0].lat), display: arr[0].display_name as string }
    : null;
  cache.set(key, hit);
  return hit;
}

async function main() {
  // Contactos con bloque electoral y SIN ubicación todavía
  const { rows } = await query<{ contact_id: string; name: string; note: string }>(
    `SELECT c.contact_id,
            trim(c.first_name || ' ' || c.surname) AS name,
            string_agg(n.note, E'\n') AS note
       FROM contact c
       JOIN contact_note n ON n.contact_id = c.contact_id
      WHERE n.note ILIKE '%PROVINCIA:%'
        AND NOT EXISTS (SELECT 1 FROM contact_location l WHERE l.contact_id = c.contact_id)
      GROUP BY c.contact_id, name`,
  );

  console.log(`${rows.length} contactos con bloque electoral sin ubicar${DRY ? " (DRY RUN)" : ""}\n`);
  let ok = 0,
    fail = 0;

  for (const r of rows) {
    const p = parse(r.note);
    const foreign = !!p.provincia && FOREIGN.has(p.provincia.toUpperCase());
    let result: { lng: number; lat: number; display: string } | null = null;
    let usedQuery = "";

    if (foreign) {
      // Votante en el exterior: geocodificar su país, sin restringir a Ecuador
      usedQuery = p.provincia!;
      result = await geocodeOne(usedQuery, false);
    } else {
      for (const q of queries(p)) {
        result = await geocodeOne(q);
        usedQuery = q;
        if (result) break;
      }
    }

    if (!result) {
      fail++;
      console.log(`✗ ${r.name.padEnd(28)} — sin resultado [${p.parroquia ?? "?"}/${p.canton ?? "?"}]`);
      continue;
    }

    ok++;
    console.log(
      `✓ ${r.name.padEnd(28)} → ${result.lat.toFixed(4)},${result.lng.toFixed(4)}  (${usedQuery})`,
    );

    if (!DRY) {
      await query(
        `INSERT INTO contact_location (contact_id, kind, address, is_primary, geom, geom_blurred)
         VALUES ($1, 'padron', $4, true,
                 ST_MakePoint($2,$3)::geography,
                 ST_SnapToGrid(ST_MakePoint($2,$3), 0.005)::geography)`,
        [r.contact_id, result.lng, result.lat, p.direccion ?? usedQuery],
      );
    }
  }

  console.log(`\nResumen: ${ok} geocodificados, ${fail} sin resultado.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
