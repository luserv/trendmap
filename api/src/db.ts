import pg from "pg";

// El driver pg devuelve los BIGINT/NUMERIC como string por seguridad de
// precisión. Para los IDs identity de trenmap, parsearlos a number es seguro.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8 / bigint

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}
