import path from "node:path";
import pg from "pg";
import { runMigrations } from "../scripts/migrate.mjs";
import { TEST_DATABASE_URL } from "./db-env";

// Recreate the test schema from scratch and apply every migration once per run.
export default async function setup() {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool, path.resolve(__dirname, "../db/migrations"), { log: () => {} });
  } finally {
    await pool.end();
  }
}
