import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "../src/env.js";
import { testDatabaseUrl } from "./test-db.js";

/** Once per `vitest run`: create the test database if needed and apply all migrations. */
export default async function setup() {
  const testUrl = testDatabaseUrl();
  const dbName = decodeURIComponent(new URL(testUrl).pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Unexpected test database name: ${dbName}`);

  // CREATE DATABASE can't run inside the target DB, so connect to the dev DB to issue it.
  const client = new pg.Client({ connectionString: loadEnv().DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      dbName,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
}
