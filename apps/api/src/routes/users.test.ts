import { ApiErrorBody, User, UserList } from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, db, login, resetDb } from "../../test/helpers.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());
beforeEach(resetDb);

type Cookies = Record<string, string>;

const patchUser = (cookies: Cookies, id: number, payload: object) =>
  app.inject({ method: "PATCH", url: `/api/users/${id}`, cookies, payload });

async function asAdmin() {
  const admin = await addUser("admin", { role: "ADMIN" });
  return { admin, cookies: await login(app, "admin") };
}

describe("access", () => {
  it("needs a login", async () => {
    expect((await app.inject({ method: "GET", url: "/api/users" })).statusCode).toBe(401);
  });

  it.each([
    ["VIEWER", {}],
    ["DESIGNER", { canProjects: true, canComponents: true }],
  ] as const)("is refused to a %s", async (role, flags) => {
    await addUser("someone", { role, ...flags });
    const cookies = await login(app, "someone");

    const res = await app.inject({ method: "GET", url: "/api/users", cookies });

    expect(res.statusCode).toBe(403);
  });

  it("follows role changes on the next request, without logging in again", async () => {
    const { cookies: adminCookies } = await asAdmin();
    const bob = await addUser("bob", { role: "VIEWER" });
    const bobCookies = await login(app, "bob");
    const listAsBob = () => app.inject({ method: "GET", url: "/api/users", cookies: bobCookies });

    expect((await listAsBob()).statusCode).toBe(403);
    await patchUser(adminCookies, bob.id, { role: "ADMIN" });
    expect((await listAsBob()).statusCode).toBe(200);
  });
});

describe("GET /api/users", () => {
  it("lists users without password hashes", async () => {
    const { cookies } = await asAdmin();
    await addUser("bob");

    const res = await app.inject({ method: "GET", url: "/api/users", cookies });

    expect(res.statusCode).toBe(200);
    const users = UserList.parse(res.json());
    expect(users.map((u) => u.username)).toEqual(["admin", "bob"]);
    expect(res.body).not.toContain("passwordHash");
  });
});

describe("POST /api/users", () => {
  const create = (cookies: Cookies, payload: object) =>
    app.inject({ method: "POST", url: "/api/users", cookies, payload });

  it("creates a VIEWER by default, who can then log in", async () => {
    const { cookies } = await asAdmin();

    const res = await create(cookies, {
      username: "carol",
      displayName: "Carol",
      password: "carols-password",
    });

    expect(res.statusCode).toBe(201);
    expect(User.parse(res.json())).toMatchObject({ username: "carol", role: "VIEWER" });
    await expect(login(app, "carol", "carols-password")).resolves.toBeDefined();
  });

  it("refuses a taken username", async () => {
    const { cookies } = await asAdmin();

    const res = await create(cookies, {
      username: "admin",
      displayName: "Again",
      password: "whatever-123",
    });

    expect(res.statusCode).toBe(409);
  });

  it("refuses a username that differs only in case", async () => {
    const { cookies } = await asAdmin();

    const res = await create(cookies, {
      username: "Admin",
      displayName: "Imposter",
      password: "whatever-123",
    });

    expect(res.statusCode).toBe(409);
    expect(ApiErrorBody.parse(res.json()).message).toMatch(/already taken/);
    expect(await db.user.count()).toBe(1);
  });

  it("refuses a designer with no permissions", async () => {
    const { cookies } = await asAdmin();

    const res = await create(cookies, {
      username: "dave",
      displayName: "Dave",
      password: "daves-password",
      role: "DESIGNER",
      canProjects: false,
      canComponents: false,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/users/:id", () => {
  it("updates the given fields", async () => {
    const { cookies } = await asAdmin();
    const bob = await addUser("bob");

    const res = await patchUser(cookies, bob.id, {
      displayName: "Robert",
      role: "DESIGNER",
      canComponents: false,
    });

    expect(res.statusCode).toBe(200);
    expect(User.parse(res.json())).toMatchObject({
      displayName: "Robert",
      role: "DESIGNER",
      canProjects: true,
      canComponents: false,
    });
  });

  it("checks the designer rule against the stored values too", async () => {
    const { cookies } = await asAdmin();
    const bob = await addUser("bob", { role: "DESIGNER", canComponents: false });

    const res = await patchUser(cookies, bob.id, { canProjects: false });

    expect(res.statusCode).toBe(400);
  });

  it("refuses unknown fields and empty updates", async () => {
    const { cookies } = await asAdmin();
    const bob = await addUser("bob");

    expect((await patchUser(cookies, bob.id, { passwordHash: "x" })).statusCode).toBe(400);
    expect((await patchUser(cookies, bob.id, {})).statusCode).toBe(400);
  });

  it("returns 404 for an unknown user", async () => {
    const { cookies } = await asAdmin();

    expect((await patchUser(cookies, 9999, { displayName: "X" })).statusCode).toBe(404);
  });

  it.each([
    ["demote", { role: "DESIGNER" }],
    ["deactivate", { active: false }],
  ])("won't %s the last active admin", async (_, payload) => {
    const { admin, cookies } = await asAdmin();

    const res = await patchUser(cookies, admin.id, payload);

    expect(res.statusCode).toBe(409);
    expect(ApiErrorBody.parse(res.json()).message).toMatch(/last active admin/);
  });

  it("allows it when another active admin exists", async () => {
    const { admin, cookies } = await asAdmin();
    await addUser("admin2", { role: "ADMIN" });

    expect((await patchUser(cookies, admin.id, { role: "VIEWER" })).statusCode).toBe(200);
  });

  it("doesn't count an inactive admin", async () => {
    const { admin, cookies } = await asAdmin();
    const other = await addUser("admin2", { role: "ADMIN" });
    await db.user.update({ where: { id: other.id }, data: { active: false } });

    expect((await patchUser(cookies, admin.id, { role: "VIEWER" })).statusCode).toBe(409);
  });

  it("lets only one of two simultaneous demotions through", async () => {
    const a = await addUser("admin-a", { role: "ADMIN" });
    const b = await addUser("admin-b", { role: "ADMIN" });
    const cookiesA = await login(app, "admin-a");
    const cookiesB = await login(app, "admin-b");

    const results = await Promise.all([
      patchUser(cookiesA, b.id, { role: "VIEWER" }),
      patchUser(cookiesB, a.id, { role: "VIEWER" }),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.user.count({ where: { role: "ADMIN", active: true } })).toBe(1);
  });

  it("logs a deactivated user out everywhere", async () => {
    const { cookies } = await asAdmin();
    const bob = await addUser("bob");
    const bobCookies = await login(app, "bob");

    await patchUser(cookies, bob.id, { active: false });

    const res = await app.inject({ method: "GET", url: "/api/auth/me", cookies: bobCookies });
    expect(res.statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: bob.id } })).toBe(0);
  });
});

describe("POST /api/users/:id/password", () => {
  const reset = (cookies: Cookies, id: number) =>
    app.inject({
      method: "POST",
      url: `/api/users/${id}/password`,
      cookies,
      payload: { password: "reset-by-admin" },
    });

  it("sets the new password and logs the user out", async () => {
    const { cookies } = await asAdmin();
    const bob = await addUser("bob");
    await login(app, "bob");

    expect((await reset(cookies, bob.id)).statusCode).toBe(204);

    expect(await db.session.count({ where: { userId: bob.id } })).toBe(0);
    await expect(login(app, "bob", "reset-by-admin")).resolves.toBeDefined();
  });

  it("keeps the admin's own session when they reset their own password", async () => {
    const { admin, cookies } = await asAdmin();

    expect((await reset(cookies, admin.id)).statusCode).toBe(204);

    const res = await app.inject({ method: "GET", url: "/api/auth/me", cookies });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for an unknown user", async () => {
    const { cookies } = await asAdmin();

    expect((await reset(cookies, 9999)).statusCode).toBe(404);
  });
});
