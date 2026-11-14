import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use workspace packages' TS source (the "source" export condition), like `pnpm dev` does.
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
});
