import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function contactRoutes(app: FastifyInstance) {
  // Crear un contacto nuevo. contact_id se genera como UUID en Postgres.
  app.post("/contacts", async (req, reply) => {
    const b = req.body as {
      first_name: string; middle_name?: string; surname: string;
      birthdate?: string; gender?: "MALE" | "FEMALE"; status_id?: string;
      instagram_username?: string;
    };
    if (!b?.first_name?.trim() || !b?.surname?.trim())
      return reply.code(400).send({ error: "first_name y surname requeridos" });

    const { rows } = await query(
      `INSERT INTO contact (contact_id, first_name, middle_name, surname, birthdate, gender, status_id, instagram_username)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
       RETURNING contact_id`,
      [
        b.first_name.trim(),
        b.middle_name?.trim() || null,
        b.surname.trim(),
        b.birthdate || null,
        b.gender || null,
        b.status_id || null,
        b.instagram_username?.trim() || null,
      ],
    );
    return reply.code(201).send({ contact_id: rows[0].contact_id });
  });

  // Listado con búsqueda por nombre/apellido y estado de ubicación.
  // Incluye lng/lat del punto principal (si lo tiene) y has_location.
  app.get("/contacts", async (req) => {
    const { q, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = "";
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE c.first_name ILIKE $1 OR c.surname ILIKE $1`;
    }
    params.push(Math.min(Number(limit) || 50, 1000), Number(offset) || 0);
    const { rows } = await query(
      `SELECT c.contact_id, c.first_name, c.middle_name, c.surname, c.gender, c.status_id,
              l.lng, l.lat, (l.lng IS NOT NULL) AS has_location
         FROM contact c
         LEFT JOIN LATERAL (
           SELECT ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat
             FROM contact_location
            WHERE contact_id = c.contact_id
            ORDER BY is_primary DESC, id
            LIMIT 1
         ) l ON true
         ${where}
         ORDER BY c.surname, c.first_name
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows;
  });

  // Detalle: contacto + teléfonos, emails, ubicaciones y tendencias
  app.get("/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(
      `SELECT
         c.*,
         COALESCE((SELECT json_agg(json_build_object('phone',phone,'label',label))
                     FROM contact_phone WHERE contact_id=c.contact_id), '[]') AS phones,
         COALESCE((SELECT json_agg(json_build_object('email',email,'label',label))
                     FROM contact_email WHERE contact_id=c.contact_id), '[]') AS emails,
         COALESCE((SELECT json_agg(json_build_object(
                       'id',id,'kind',kind,'address',address,'is_primary',is_primary,
                       'lng',ST_X(geom::geometry),'lat',ST_Y(geom::geometry)))
                     FROM contact_location WHERE contact_id=c.contact_id), '[]') AS locations,
         COALESCE((SELECT json_agg(json_build_object(
                       'trait_id',t.id,'kind',t.kind,'label',t.label,'color',t.color,
                       'weight',ct.weight,'source',ct.source))
                     FROM contact_trait ct JOIN trait t ON t.id=ct.trait_id
                    WHERE ct.contact_id=c.contact_id), '[]') AS traits
       FROM contact c WHERE c.contact_id=$1`,
      [id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: "no encontrado" });
    return rows[0];
  });

  // Añadir ubicación a un contacto. blur=true genera geom_blurred (rejilla ~0.5km)
  app.post("/contacts/:id/locations", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as {
      kind?: string; lng: number; lat: number;
      address?: string; is_primary?: boolean; blur?: boolean;
    };
    if (typeof b?.lng !== "number" || typeof b?.lat !== "number")
      return reply.code(400).send({ error: "lng y lat (number) requeridos" });

    const blurExpr = b.blur
      ? `ST_SnapToGrid(ST_MakePoint($2,$3), 0.005)::geography`
      : `NULL`;
    try {
      const { rows } = await query(
        `INSERT INTO contact_location (contact_id, kind, address, is_primary, geom, geom_blurred)
         VALUES ($1,$4,$5,$6, ST_MakePoint($2,$3)::geography, ${blurExpr})
         RETURNING id, kind, address, is_primary,
                   ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat`,
        [id, b.lng, b.lat, b.kind ?? null, b.address ?? null, b.is_primary ?? false],
      );
      return reply.code(201).send(rows[0]);
    } catch (e: any) {
      if (e.code === "23503") return reply.code(404).send({ error: "contacto inexistente" });
      throw e;
    }
  });

  // Asignar / mover el punto PRINCIPAL del contacto (un punto por contacto).
  // Upsert: si ya tiene principal lo mueve; si no, lo crea.
  app.put("/contacts/:id/location", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { lng: number; lat: number; kind?: string; address?: string; blur?: boolean };
    if (typeof b?.lng !== "number" || typeof b?.lat !== "number")
      return reply.code(400).send({ error: "lng y lat (number) requeridos" });

    const blurExpr = b.blur
      ? `ST_SnapToGrid(ST_MakePoint($2,$3), 0.005)::geography`
      : `NULL`;

    const upd = await query(
      `UPDATE contact_location
          SET geom = ST_MakePoint($2,$3)::geography,
              geom_blurred = ${blurExpr},
              kind = COALESCE($4, kind),
              address = COALESCE($5, address)
        WHERE contact_id = $1 AND is_primary = true
        RETURNING id, kind, address, is_primary,
                  ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat`,
      [id, b.lng, b.lat, b.kind ?? null, b.address ?? null],
    );
    if (upd.rowCount) return upd.rows[0];

    try {
      const ins = await query(
        `INSERT INTO contact_location (contact_id, kind, address, is_primary, geom, geom_blurred)
         VALUES ($1, COALESCE($4,'principal'), $5, true, ST_MakePoint($2,$3)::geography, ${blurExpr})
         RETURNING id, kind, address, is_primary,
                   ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat`,
        [id, b.lng, b.lat, b.kind ?? null, b.address ?? null],
      );
      return reply.code(201).send(ins.rows[0]);
    } catch (e: any) {
      if (e.code === "23503") return reply.code(404).send({ error: "contacto inexistente" });
      throw e;
    }
  });

  app.delete("/contacts/:id/locations/:locId", async (req, reply) => {
    const { id, locId } = req.params as { id: string; locId: string };
    const { rowCount } = await query(
      `DELETE FROM contact_location WHERE id=$1 AND contact_id=$2`,
      [Number(locId), id],
    );
    return reply.code(rowCount ? 204 : 404).send();
  });

  // Asignar tendencia. Acepta trait_id, o (kind,label) -> find-or-create.
  app.post("/contacts/:id/traits", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as {
      trait_id?: number; kind?: string; label?: string;
      weight?: number; source?: string;
    };
    let traitId = b.trait_id;
    if (!traitId) {
      if (!b.kind || !b.label)
        return reply.code(400).send({ error: "trait_id, o kind+label requeridos" });
      const { rows } = await query(
        `INSERT INTO trait (kind,label) VALUES ($1,$2)
         ON CONFLICT (kind,label) DO UPDATE SET label=EXCLUDED.label
         RETURNING id`,
        [b.kind, b.label],
      );
      traitId = rows[0].id;
    }
    try {
      const { rows } = await query(
        `INSERT INTO contact_trait (contact_id, trait_id, weight, source)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (contact_id, trait_id)
           DO UPDATE SET weight=EXCLUDED.weight, source=EXCLUDED.source, updated_at=now()
         RETURNING contact_id, trait_id, weight, source`,
        [id, traitId, b.weight ?? 1, b.source ?? null],
      );
      return reply.code(201).send(rows[0]);
    } catch (e: any) {
      if (e.code === "23503") return reply.code(404).send({ error: "contacto inexistente" });
      throw e;
    }
  });

  app.delete("/contacts/:id/traits/:traitId", async (req, reply) => {
    const { id, traitId } = req.params as { id: string; traitId: string };
    const { rowCount } = await query(
      `DELETE FROM contact_trait WHERE contact_id=$1 AND trait_id=$2`,
      [id, Number(traitId)],
    );
    return reply.code(rowCount ? 204 : 404).send();
  });

  // Árbol familiar: BFS por contact_relationship hasta `depth` saltos.
  // Retorna nodos (contactos) y aristas deduplicadas.
  app.get("/contacts/:id/family-tree", async (req, reply) => {
    const { id } = req.params as { id: string };
    const depth = Math.min(Number((req.query as Record<string, string>).depth) || 4, 6);

    // Verificar que el contacto existe
    const exists = await query(`SELECT 1 FROM contact WHERE contact_id=$1`, [id]);
    if (!exists.rowCount) return reply.code(404).send({ error: "contacto no encontrado" });

    // BFS para encontrar todos los familiares dentro de `depth` saltos.
    // Usamos un array "path" como conjunto de visitados para evitar ciclos.
    const { rows: familyRows } = await query<{ id: string }>(
      `WITH RECURSIVE family(id, path) AS (
         SELECT $1::text, ARRAY[$1::text]
         UNION ALL
         SELECT n.neighbor, f.path || n.neighbor
         FROM family f,
         LATERAL (
           SELECT related_contact_id AS neighbor
             FROM contact_relationship WHERE contact_id = f.id
           UNION ALL
           SELECT contact_id AS neighbor
             FROM contact_relationship WHERE related_contact_id = f.id
         ) n
         WHERE NOT n.neighbor = ANY(f.path)
           AND array_length(f.path, 1) <= $2
       )
       SELECT DISTINCT id FROM family`,
      [id, depth],
    );

    const contactIds = familyRows.map((r) => r.id);

    // Nodos: datos de contacto para todos los familiares
    const { rows: nodeRows } = await query(
      `SELECT c.contact_id, c.first_name, c.middle_name, c.surname, c.gender,
              EXISTS (SELECT 1 FROM contact_location l WHERE l.contact_id = c.contact_id) AS has_location
         FROM contact c
        WHERE c.contact_id = ANY($1)`,
      [contactIds],
    );

    // Aristas deduplicadas:
    //   tipos "padre" (padre/madre/abuelo/abuela/tio/tia): fuente → hijo (direccion natural del árbol)
    //   tipos simétricos (cónyuge/hermano/hermana/primo/prima): solo la dirección contact_id < related
    //   tipos "hijo" (hijo/hija/nieto/nieta/sobrino/sobrina): omitidos (son la inversa de los de arriba)
    const { rows: edgeRows } = await query(
      `SELECT cr.id, cr.contact_id AS source, cr.related_contact_id AS target,
              cr.type_id, rt.label
         FROM contact_relationship cr
         JOIN relationship_type rt ON rt.type_id = cr.type_id
        WHERE cr.contact_id = ANY($1)
          AND cr.related_contact_id = ANY($1)
          AND (
            cr.type_id IN ('padre','madre','abuelo','abuela','tio','tia')
            OR
            (cr.type_id IN ('conyuge','hermano','hermana','primo','prima')
             AND cr.contact_id < cr.related_contact_id)
          )`,
      [contactIds],
    );

    return { root_id: id, nodes: nodeRows, edges: edgeRows };
  });

  // Actualizar datos básicos del contacto.
  app.patch("/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as {
      first_name?: string; middle_name?: string | null; surname?: string;
      birthdate?: string | null; gender?: "MALE" | "FEMALE" | null; status_id?: string | null;
    };
    if (b.first_name !== undefined && !b.first_name.trim())
      return reply.code(400).send({ error: "first_name no puede estar vacío" });
    if (b.surname !== undefined && !b.surname.trim())
      return reply.code(400).send({ error: "surname no puede estar vacío" });

    const sets: string[] = [];
    const vals: unknown[] = [id];
    const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col}=$${vals.length}`); };

    if (b.first_name  !== undefined) add("first_name",  b.first_name.trim());
    if (b.middle_name !== undefined) add("middle_name", b.middle_name?.trim() || null);
    if (b.surname     !== undefined) add("surname",     b.surname.trim());
    if (b.birthdate   !== undefined) add("birthdate",   b.birthdate || null);
    if (b.gender      !== undefined) add("gender",      b.gender || null);
    if (b.status_id   !== undefined) add("status_id",   b.status_id || null);

    if (sets.length === 0) return reply.code(400).send({ error: "sin cambios" });

    const { rowCount } = await query(
      `UPDATE contact SET ${sets.join(",")} WHERE contact_id=$1`,
      vals,
    );
    if (!rowCount) return reply.code(404).send({ error: "contacto no encontrado" });
    return reply.code(204).send();
  });

  // Eliminar un contacto (cascada a todas sus tablas dependientes).
  app.delete("/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rowCount } = await query(`DELETE FROM contact WHERE contact_id=$1`, [id]);
    return reply.code(rowCount ? 204 : 404).send();
  });

  // Vincular / desvincular cuenta de Instagram de un contacto.
  app.patch("/contacts/:id/instagram", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { instagram_username } = req.body as { instagram_username: string | null };
    const { rowCount } = await query(
      `UPDATE contact SET instagram_username = $2 WHERE contact_id = $1`,
      [id, instagram_username ?? null],
    );
    if (!rowCount) return reply.code(404).send({ error: "contacto no encontrado" });
    return reply.code(204).send();
  });
}
