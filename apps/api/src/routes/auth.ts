import { ChangePasswordInput, LoginInput } from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { currentUser, requireAuth } from "../auth/guards.js";
import { sessionCookieOptions, type AuthConfig } from "../auth/plugin.js";
import { createSession } from "../auth/sessions.js";
import { HttpError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { authenticate, changeOwnPassword } from "../services/users.js";

export interface AuthRoutesOptions {
  db: PrismaClient;
  auth: AuthConfig;
}

export const authRoutes: FastifyPluginCallback<AuthRoutesOptions> = (app, { db, auth }, done) => {
  // Responses are PublicUser rows; dates serialize to the ISO strings the shared `User` expects.
  app.post("/auth/login", async (request, reply) => {
    const { username, password } = LoginInput.parse(request.body);
    const user = await authenticate(db, username, password);
    if (!user) throw new HttpError(401, "Invalid username or password");

    // Logging in again from the same browser replaces its previous session.
    if (request.sessionId) await db.session.deleteMany({ where: { id: request.sessionId } });
    const { token, expiresAt } = await createSession(db, user.id);
    void reply.setCookie(auth.cookieName, token, sessionCookieOptions(auth, expiresAt));
    return user;
  });

  app.post("/auth/logout", async (request, reply) => {
    if (request.sessionId) await db.session.deleteMany({ where: { id: request.sessionId } });
    void reply.clearCookie(auth.cookieName, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireAuth }, (request) => currentUser(request));

  app.post("/auth/password", { preHandler: requireAuth }, async (request, reply) => {
    const input = ChangePasswordInput.parse(request.body);
    await changeOwnPassword(db, currentUser(request).id, request.sessionId, input);
    return reply.code(204).send();
  });

  done();
};
