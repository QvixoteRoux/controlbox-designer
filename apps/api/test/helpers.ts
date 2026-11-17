import type { CreateUserInput } from "@cabinet-planner/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import { createPrisma } from "../src/db.js";
import { LocalImageStore } from "../src/images.js";
import { createUser } from "../src/services/users.js";
import { testDatabaseUrl } from "./test-db.js";

export const COOKIE = "cp_session";

export const db = createPrisma(testDatabaseUrl());
afterAll(() => db.$disconnect());

/** Uploaded images go to a temporary folder per test file. */
export const uploadDir = mkdtempSync(join(tmpdir(), "cp-uploads-"));
afterAll(() => rmSync(uploadDir, { recursive: true, force: true }));

export function buildTestApp(overrides: Partial<AppDeps> = {}) {
  return buildApp({
    db,
    pingDb: async () => {
      await db.$queryRaw`SELECT 1`;
    },
    auth: { cookieName: COOKIE, secureCookies: false },
    images: new LocalImageStore(uploadDir),
    ...overrides,
  });
}

/** Empty every table that holds test data (CASCADE reaches projects, sessions, cabinets…). */
export async function resetDb() {
  await db.$executeRaw`
    TRUNCATE TABLE users, cabinet_types, component_types, components, cable_glands
    RESTART IDENTITY CASCADE`;
}

export const PASSWORD = "correct-horse";

export function addUser(
  username: string,
  fields: Partial<Omit<CreateUserInput, "username" | "password">> = {},
) {
  return createUser(db, {
    username,
    displayName: username,
    password: PASSWORD,
    role: "VIEWER",
    canProjects: true,
    canComponents: true,
    ...fields,
  });
}

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Logs in and returns the session cookie to pass as `cookies` to app.inject. */
export async function login(app: TestApp, username: string, password = PASSWORD) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  const cookie = res.cookies.find((c) => c.name === COOKIE);
  if (res.statusCode !== 200 || !cookie) {
    throw new Error(`login as ${username} failed: ${res.statusCode} ${res.body}`);
  }
  return { [COOKIE]: cookie.value };
}
