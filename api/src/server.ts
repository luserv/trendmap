import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool } from "./db.js";
import contactRoutes from "./routes/contacts.js";
import traitRoutes from "./routes/traits.js";
import geoRoutes from "./routes/geo.js";
import zoneRoutes from "./routes/zones.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => {
  const { rows } = await pool.query("SELECT 1 AS ok, postgis_version() AS postgis");
  return { ok: rows[0].ok === 1, postgis: rows[0].postgis };
});

await app.register(contactRoutes);
await app.register(traitRoutes);
await app.register(geoRoutes);
await app.register(zoneRoutes);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
