import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
    // Real-Postgres tests run separately: `npm run test:db`.
    exclude: ["**/*.db.test.ts", "node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
    // CopilotKit's v2 entry imports its own CSS; let Vite transform it so
    // tests can use the real hooks (useRenderTool / useRenderToolCall).
    server: { deps: { inline: [/@copilotkit\/react-core/] } },
  },
});
