// Connection string for the DB test suite. Never points at the dev database.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/personal_web_test";
