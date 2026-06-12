import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function zoneRoutes(app: FastifyInstance) {
  // Zonas como GeoJSON con conteo de contactos dentro de cada polígono
  app.get("/geo/zones", async () => {
    const { rows } = await query(
      `SELECT json_build_object(
         'type','FeatureCollection',
         'features', COALESCE(json_agg(json_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(z.geom)::json,
            'properties', json_build_object(
               'zone_id',       z.id,
               'name',          z.name,
               'color',         z.color,
               'contact_count', (
                 SELECT count(DISTINCT l.contact_id)
                   FROM contact_location l
                  WHERE ST_Within(l.geom::geometry, z.geom::geometry)
               )
            ))), '[]'::json)
       ) AS geojson
       FROM zone z`,
    );
    return rows[0].geojson;
  });

  // Crear zona. Body: { name, color?, coordinates: [[lng,lat], ...] }
  app.post("/zones", async (req, reply) => {
    const b = req.body as { name: string; color?: string; coordinates: [number, number][] };
    if (!b.name?.trim() || !Array.isArray(b.coordinates) || b.coordinates.length < 3)
      return reply.code(400).send({ error: "name y coordinates (mín 3 puntos) requeridos" });

    const coords = [...b.coordinates];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);

    const geojson = JSON.stringify({ type: "Polygon", coordinates: [coords] });
    try {
      const { rows } = await query(
        `INSERT INTO zone (name, color, geom)
         VALUES ($1, $2, ST_GeomFromGeoJSON($3)::geography)
         RETURNING id, name, color, created_at`,
        [b.name.trim(), b.color ?? "#38bdf8", geojson],
      );
      return reply.code(201).send(rows[0]);
    } catch (e: any) {
      if (e.code === "22023") return reply.code(400).send({ error: "polígono inválido" });
      throw e;
    }
  });

  // Actualizar nombre o color de una zona
  app.patch("/zones/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { name?: string; color?: string };
    const { rows, rowCount } = await query(
      `UPDATE zone
          SET name  = COALESCE($2, name),
              color = COALESCE($3, color)
        WHERE id = $1
        RETURNING id, name, color`,
      [Number(id), b.name ?? null, b.color ?? null],
    );
    if (!rowCount) return reply.code(404).send({ error: "zona no encontrada" });
    return rows[0];
  });

  // Eliminar zona
  app.delete("/zones/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rowCount } = await query(`DELETE FROM zone WHERE id = $1`, [Number(id)]);
    return reply.code(rowCount ? 204 : 404).send();
  });

  // Contactos dentro de una zona específica
  app.get("/zones/:id/contacts", async (req, reply) => {
    const { id } = req.params as { id: string };
    const zoneCheck = await query(`SELECT id FROM zone WHERE id = $1`, [Number(id)]);
    if (!zoneCheck.rowCount) return reply.code(404).send({ error: "zona no encontrada" });

    const { rows } = await query(
      `SELECT c.contact_id, c.first_name, c.surname,
              ST_X(l.geom::geometry) AS lng, ST_Y(l.geom::geometry) AS lat
         FROM zone z
         JOIN contact_location l ON ST_Within(l.geom::geometry, z.geom::geometry)
         JOIN contact c ON c.contact_id = l.contact_id
        WHERE z.id = $1
        ORDER BY c.surname, c.first_name`,
      [Number(id)],
    );
    return rows;
  });
}
