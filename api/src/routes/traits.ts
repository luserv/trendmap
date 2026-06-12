import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function traitRoutes(app: FastifyInstance) {
  // Catálogo de tendencias, con cuántos contactos tiene cada una
  app.get("/traits", async (req) => {
    const { kind } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = "";
    if (kind) {
      params.push(kind);
      where = "WHERE t.kind = $1";
    }
    const { rows } = await query(
      `SELECT t.id, t.kind, t.label, t.color, count(ct.contact_id)::int AS contacts
         FROM trait t
         LEFT JOIN contact_trait ct ON ct.trait_id = t.id
         ${where}
         GROUP BY t.id
         ORDER BY t.kind, t.label`,
      params,
    );
    return rows;
  });

  app.post("/traits", async (req, reply) => {
    const b = req.body as { kind?: string; label?: string; color?: string };
    if (!b?.kind || !b?.label)
      return reply.code(400).send({ error: "kind y label requeridos" });
    const { rows } = await query(
      `INSERT INTO trait (kind,label,color) VALUES ($1,$2,COALESCE($3,'#38bdf8'))
       ON CONFLICT (kind,label) DO UPDATE SET label=EXCLUDED.label
       RETURNING id, kind, label, color`,
      [b.kind, b.label, b.color ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  // Actualizar color y/o etiqueta de una tendencia
  app.patch("/traits/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { color?: string; label?: string; kind?: string };
    if (!b?.color && !b?.label && !b?.kind)
      return reply.code(400).send({ error: "color, label o kind requeridos" });
    const { rows } = await query(
      `UPDATE trait
          SET color = COALESCE($2, color),
              label = COALESCE($3, label),
              kind  = COALESCE($4, kind)
        WHERE id = $1
        RETURNING id, kind, label, color`,
      [Number(id), b.color ?? null, b.label ?? null, b.kind ?? null],
    );
    if (rows.length === 0) return reply.code(404).send({ error: "no encontrada" });
    return rows[0];
  });

  // Eliminar una tendencia del catálogo (también quita las asignaciones)
  app.delete("/traits/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rowCount } = await query(`DELETE FROM trait WHERE id=$1`, [Number(id)]);
    return reply.code(rowCount ? 204 : 404).send();
  });
}
