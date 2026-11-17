import cookie, { type CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { resolveSession, type PublicUser } from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The logged-in user, or null. Set on every request by the auth hook. */
    user: PublicUser | null;
    /** Hashed id of the current session, or null. */
    sessionId: string | null;
  }
}

export interface AuthConfig {
  cookieName: string;
  /** Secure flag on the session cookie (HTTPS only). On in production. */
  secureCookies: boolean;
}

export const sessionCookieOptions = (
  config: AuthConfig,
  expires: Date,
): CookieSerializeOptions => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: config.secureCookies,
  expires,
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard. Browsers send Origin on cross-site writes; SameSite=Lax alone doesn't stop a
 * cross-site `text/plain` form POST. Requests without Origin (curl, tests) aren't from a browser
 * page, so they can't ride on a victim's cookie.
 */
function isSameOrigin(request: FastifyRequest) {
  const { origin, host } = request.headers;
  if (origin === undefined) return true;
  try {
    const originUrl = new URL(origin);
    // Parse Host with the same scheme so default ports compare equal ("localhost:80" vs "localhost").
    return originUrl.host === new URL(`${originUrl.protocol}//${host}`).host;
  } catch {
    return false;
  }
}

/** Cookie parsing, the CSRF origin check, and `request.user` from the session cookie. */
export async function registerAuth(app: FastifyInstance, db: PrismaClient, config: AuthConfig) {
  await app.register(cookie);
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
      throw new HttpError(403, "Cross-origin request refused");
    }

    const token = request.cookies[config.cookieName];
    if (!token) return;

    const session = await resolveSession(db, token);
    if (!session) {
      void reply.clearCookie(config.cookieName, { path: "/" });
      return;
    }
    request.user = session.user;
    request.sessionId = session.sessionId;
    if (session.renewed) {
      void reply.setCookie(
        config.cookieName,
        token,
        sessionCookieOptions(config, session.expiresAt),
      );
    }
  });
}
