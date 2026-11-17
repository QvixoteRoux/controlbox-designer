import { ApiErrorBody, User } from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, COOKIE, db, login, PASSWORD, resetDb } from "../../test/helpers.js";
import { hashToken, SESSION_TTL_MS } from "../auth/sessions.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());
beforeEach(resetDb);

const me = (cookies: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/api/auth/me", cookies });

describe("POST /api/auth/login", () => {
  it("returns the user and sets an httpOnly session cookie", async () => {
    await addUser("alice");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alice", password: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const user = User.parse(res.json());
    expect(user.username).toBe("alice");
    expect(res.json()).not.toHaveProperty("passwordHash");

    const cookie = res.cookies.find((c) => c.name === COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    // Only the hash of the token is stored.
    const session = await db.session.findFirstOrThrow();
    expect(session.id).toBe(hashToken(cookie!.value));
    expect(session.id).not.toBe(cookie!.value);
  });

  it.each([
    ["wrong password", "alice", "nope-nope"],
    ["unknown user", "bob", PASSWORD],
  ])("refuses a %s with the same message", async (_, username, password) => {
    await addUser("alice");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });

    expect(res.statusCode).toBe(401);
    expect(ApiErrorBody.parse(res.json()).message).toBe("Invalid username or password");
  });

  it("matches the username's exact case", async () => {
    await addUser("alice");

    await expect(login(app, "Alice")).rejects.toThrow(/401/);
    await expect(login(app, "alice")).resolves.toBeDefined();
  });

  it("refuses an inactive user", async () => {
    const user = await addUser("alice");
    await db.user.update({ where: { id: user.id }, data: { active: false } });

    await expect(login(app, "alice")).rejects.toThrow(/401/);
  });

  it("rejects malformed input with field errors", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });

    expect(res.statusCode).toBe(400);
    expect(ApiErrorBody.parse(res.json()).fields).toHaveProperty("username");
  });
});

describe("GET /api/auth/me", () => {
  it("needs a session", async () => {
    expect((await me()).statusCode).toBe(401);
    expect((await me({ [COOKIE]: "made-up-token" })).statusCode).toBe(401);
  });

  it("returns the logged-in user", async () => {
    await addUser("alice", { role: "DESIGNER" });
    const cookies = await login(app, "alice");

    const res = await me(cookies);

    expect(res.statusCode).toBe(200);
    expect(User.parse(res.json())).toMatchObject({ username: "alice", role: "DESIGNER" });
  });

  it("drops an expired session", async () => {
    await addUser("alice");
    const cookies = await login(app, "alice");
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await me(cookies)).statusCode).toBe(401);
    expect(await db.session.count()).toBe(0);
  });

  it("pushes the expiry forward when the session is used after a day or more", async () => {
    await addUser("alice");
    const cookies = await login(app, "alice");
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await db.session.updateMany({ data: { expiresAt: soon } });

    const res = await me(cookies);

    expect(res.statusCode).toBe(200);
    const { expiresAt } = await db.session.findFirstOrThrow();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    expect(res.cookies.find((c) => c.name === COOKIE)?.value).toBe(cookies[COOKIE]);
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session", async () => {
    await addUser("alice");
    const cookies = await login(app, "alice");

    const res = await app.inject({ method: "POST", url: "/api/auth/logout", cookies });

    expect(res.statusCode).toBe(204);
    expect(await db.session.count()).toBe(0);
    expect((await me(cookies)).statusCode).toBe(401);
  });
});

describe("cross-origin writes", () => {
  it("are refused when the Origin doesn't match the host", async () => {
    await addUser("alice");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://evil.example" },
      payload: { username: "alice", password: PASSWORD },
    });

    expect(res.statusCode).toBe(403);
  });

  it("are allowed from the same origin", async () => {
    await addUser("alice");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:80" },
      payload: { username: "alice", password: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/auth/password", () => {
  const change = (cookies: Record<string, string>, currentPassword: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/password",
      cookies,
      payload: { currentPassword, newPassword: "brand-new-pass" },
    });

  it("needs the current password", async () => {
    await addUser("alice");
    const cookies = await login(app, "alice");

    const res = await change(cookies, "wrong-guess");

    expect(res.statusCode).toBe(400);
    expect(ApiErrorBody.parse(res.json()).message).toBe("Current password is incorrect");
  });

  it("changes it, keeps this session and ends the others", async () => {
    await addUser("alice");
    const here = await login(app, "alice");
    const elsewhere = await login(app, "alice");

    expect((await change(here, PASSWORD)).statusCode).toBe(204);

    expect((await me(here)).statusCode).toBe(200);
    expect((await me(elsewhere)).statusCode).toBe(401);
    await expect(login(app, "alice")).rejects.toThrow(/401/);
    await expect(login(app, "alice", "brand-new-pass")).resolves.toBeDefined();
  });
});
