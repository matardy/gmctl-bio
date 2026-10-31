import { afterAll, beforeEach } from "vitest";
import { TEST_DATABASE_URL } from "./db-env";

// Point the app's pool at the test database before any module creates it.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { getPool, closePool } = await import("@/lib/db");

beforeEach(async () => {
  await getPool().query(
    "TRUNCATE chat_messages, chat_usage_events, topic_moderation_events, visitor_identities RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await closePool();
});
