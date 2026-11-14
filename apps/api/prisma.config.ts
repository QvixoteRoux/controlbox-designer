import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

// One .env at the repo root, loaded by explicit path so Prisma finds it
// whatever folder the command runs from.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

// Prisma 7+: connection URL and migration settings live here, not in schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=source prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
