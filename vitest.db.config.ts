import path from "node:path";
import { defineConfig } from "vitest/config";

// DB integration tests: run against a real Postgres (`npm run db:up`).
// Kept out of `npm test` so the unit suite never needs a database.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    globalSetup: ["./tests/db-global-setup.ts"],
    setupFiles: ["./tests/db-setup.ts"],
    // One shared test database: run files one at a time.
    fileParallelism: false,
  },
});
