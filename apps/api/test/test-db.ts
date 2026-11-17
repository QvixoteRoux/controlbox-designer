import { loadEnv } from "../src/env.js";

/**
 * Integration tests run against their own database: TEST_DATABASE_URL if set, otherwise
 * DATABASE_URL with "_test" appended to the database name (cabinet_planner → cabinet_planner_test).
 * Dev data is never touched.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(loadEnv().DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}
