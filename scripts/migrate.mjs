// Minimal SQL migration runner (no extra deps).
//
//   npm run db:migrate
//
// Applies db/migrations/*.sql in filename order, each in its own transaction,
// and records applied versions in `schema_migrations`. A Postgres advisory
// lock serialises concurrent runs (e.g. several app instances deploying).
//
// Connection: DATABASE_URL_UNPOOLED (Neon direct endpoint) if set, else
// DATABASE_URL. Session-level advisory locks need a direct connection, not a
// transaction-mode pooler such as Neon's PgBouncer endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const LOCK_KEY = 727_311_001; // arbitrary, stable per project

/**
 * @param {import('pg').Pool} pool
 * @param {string} migrationsDir
 * @param {{ log?: (msg: string) => void }} [options]
 * @returns {Promise<string[]>} versions applied by this run, in order
 */
export async function runMigrations(pool, migrationsDir, options = {}) {
  const log = options.log ?? ((msg) => console.log(msg));
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));

    const applied = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed: ${error.message}`, { cause: error });
      }
      applied.push(version);
      log(`applied ${version}`);
    }

    if (applied.length === 0) log('database is up to date');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set');
    process.exit(1);
  }
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await runMigrations(pool, migrationsDir);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
