import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.mjs";
import { TEST_DATABASE_URL } from "../tests/db-env";

const REAL_MIGRATIONS = path.resolve(__dirname, "../db/migrations");
const silent = { log: () => {} };

// Each test runs in its own throwaway schema so it never touches `public`.
let schema: string;
let pool: pg.Pool;

beforeEach(async () => {
  schema = `mig_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({
    connectionString: TEST_DATABASE_URL,
    max: 1,
    options: `-c search_path=${schema}`,
  });
});

afterEach(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

async function tablesInSchema() {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
    [schema],
  );
  return rows.map((r) => r.table_name);
}

describe("runMigrations", () => {
  it("applies every migration in order on an empty schema and records each version", async () => {
    const applied = await runMigrations(pool, REAL_MIGRATIONS, silent);

    expect(applied).toEqual([
      "20260427000001_create_chat_messages",
      "20260505000002_add_chat_quota_tables",
      "20261031000001_add_chat_messages_tool_calls",
    ]);
    expect(await tablesInSchema()).toEqual([
      "chat_messages",
      "chat_usage_events",
      "schema_migrations",
      "topic_moderation_events",
      "visitor_identities",
    ]);
    const { rows } = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    expect(rows.map((r) => r.version)).toEqual(applied);
  });

  it("is idempotent: a second run applies nothing", async () => {
    await runMigrations(pool, REAL_MIGRATIONS, silent);
    const second = await runMigrations(pool, REAL_MIGRATIONS, silent);
    expect(second).toEqual([]);
  });

  it("rolls back a failing migration and does not record it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "migrations-"));
    await fs.writeFile(path.join(dir, "001_ok.sql"), "CREATE TABLE ok_table (id int);");
    await fs.writeFile(
      path.join(dir, "002_broken.sql"),
      "CREATE TABLE half_done (id int); SELECT * FROM table_that_does_not_exist;",
    );

    await expect(runMigrations(pool, dir, silent)).rejects.toThrow(/002_broken/);

    expect(await tablesInSchema()).toEqual(["ok_table", "schema_migrations"]);
    const { rows } = await pool.query("SELECT version FROM schema_migrations");
    expect(rows.map((r) => r.version)).toEqual(["001_ok"]);
    await fs.rm(dir, { recursive: true });
  });
});
