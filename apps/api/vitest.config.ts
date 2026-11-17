import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use workspace packages' TS source (the "source" export condition), like `pnpm dev` does.
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    // Creates and migrates the test database (see test/test-db.ts). Needs PostgreSQL running.
    globalSetup: ["./test/global-setup.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
