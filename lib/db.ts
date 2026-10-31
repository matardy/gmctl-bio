import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * One Postgres pool per server process, created lazily on first use.
 *
 * - Cached on globalThis so `next dev` hot reloads don't leak a new pool
 *   (and its connections) on every module re-evaluation.
 * - Connections per process are capped by DATABASE_POOL_MAX (default 5).
 *   Total = max × instances. Locally that's a handful against Postgres'
 *   default max_connections=100; on Neon, DATABASE_URL should be the pooled
 *   (-pooler) endpoint, which accepts up to 10k client connections.
 * - Idle clients can error when the server drops them (restart, Neon
 *   scale-to-zero). Without an 'error' listener that would crash the process.
 */
const globalForDb = globalThis as typeof globalThis & { __gmctlPgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (error) => {
    console.error('[db] idle client error', error);
  });
  return pool;
}

export function getPool(): Pool {
  globalForDb.__gmctlPgPool ??= createPool();
  return globalForDb.__gmctlPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Runs `fn` inside BEGIN/COMMIT on one client; rolls back if it throws. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Closes the pool (tests, scripts). The next getPool() creates a new one. */
export async function closePool(): Promise<void> {
  const pool = globalForDb.__gmctlPgPool;
  globalForDb.__gmctlPgPool = undefined;
  await pool?.end();
}
