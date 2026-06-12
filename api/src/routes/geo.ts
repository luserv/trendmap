import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function geoRoutes(app: FastifyInstance) {
  // Ubicaciones como GeoJSON para pintar en el mapa.
  //   ?bbox=minLng,minLat,maxLng,maxLat  filtra por ventana visible
  //   ?blurred=true                      usa el punto difuminado (privacidad)
  app.get("/geo/locations", async (req) => {
    const { bbox, blurred } = req.query as Record<string, string>;
    const geomCol = blurred === "true" ? "COALESCE(l.geom_blurred, l.geom)" : "l.geom";
    const params: unknown[] = [];
    let where = "";
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      params.push(minLng, minLat, maxLng, maxLat);
      where = `WHERE ${geomCol} && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography`;
    }
    const { rows } = await query(
      `SELECT json_build_object(
         'type','FeatureCollection',
         'features', COALESCE(json_agg(json_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(${geomCol})::json,
            'properties', json_build_object(
               'location_id', l.id,
               'contact_id', c.contact_id,
               'name', c.first_name || ' ' || c.surname,
               'kind', l.kind,
               'color', COALESCE(tt.color, '#4ade80'),
               'trait', tt.label
            ))), '[]'::json)
       ) AS geojson
       FROM contact_location l
       JOIN contact c ON c.contact_id = l.contact_id
       LEFT JOIN LATERAL (
         SELECT t.color, t.label
           FROM contact_trait ct JOIN trait t ON t.id = ct.trait_id
          WHERE ct.contact_id = c.contact_id
          ORDER BY ct.weight DESC, t.id
          LIMIT 1
       ) tt ON true
       ${where}`,
      params,
    );
    return rows[0].geojson;
  });

  // Contactos cerca de un punto, opcionalmente filtrando por tendencia.
  //   ?lng=&lat=&radius=metros (def 5000)&trait=label
  app.get("/geo/nearby", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const lng = Number(q.lng), lat = Number(q.lat);
    const radius = Number(q.radius) || 5000;
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
      return reply.code(400).send({ error: "lng y lat requeridos" });

    const params: unknown[] = [lng, lat, radius];
    let traitJoin = "", traitWhere = "";
    if (q.trait) {
      params.push(q.trait);
      traitJoin = `JOIN contact_trait ct ON ct.contact_id = c.contact_id
                   JOIN trait t ON t.id = ct.trait_id`;
      traitWhere = `AND t.label = $4`;
    }
    const { rows } = await query(
      `SELECT json_build_object(
         'type','FeatureCollection',
         'features', COALESCE(json_agg(DISTINCT jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(l.geom)::jsonb,
            'properties', jsonb_build_object(
               'contact_id', c.contact_id,
               'name', c.first_name || ' ' || c.surname,
               'meters', round(ST_Distance(l.geom, ST_MakePoint($1,$2)::geography)::numeric, 1)
            ))), '[]'::json)
       ) AS geojson
       FROM contact_location l
       JOIN contact c ON c.contact_id = l.contact_id
       ${traitJoin}
       WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3)
       ${traitWhere}`,
      params,
    );
    return rows[0].geojson;
  });

  // Tendencias agregadas dentro de un radio: qué preferencia domina la zona.
  //   ?lng=&lat=&radius=metros (def 5000)&kind=opcional
  app.get("/geo/trends", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const lng = Number(q.lng), lat = Number(q.lat);
    const radius = Number(q.radius) || 5000;
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
      return reply.code(400).send({ error: "lng y lat requeridos" });

    const params: unknown[] = [lng, lat, radius];
    let kindWhere = "";
    if (q.kind) {
      params.push(q.kind);
      kindWhere = "AND t.kind = $4";
    }
    const { rows } = await query(
      `SELECT t.kind, t.label, t.color,
              count(DISTINCT c.contact_id)::int AS contacts,
              round(sum(ct.weight)::numeric, 2) AS total_weight
         FROM contact_location l
         JOIN contact c       ON c.contact_id = l.contact_id
         JOIN contact_trait ct ON ct.contact_id = c.contact_id
         JOIN trait t          ON t.id = ct.trait_id
        WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3)
        ${kindWhere}
        GROUP BY t.kind, t.label, t.color
        ORDER BY contacts DESC, total_weight DESC`,
      params,
    );
    return { center: { lng, lat }, radius, trends: rows };
  });
}
