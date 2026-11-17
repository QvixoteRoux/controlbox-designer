import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

// Server-side sessions (guidelines/permissions.md). The DB stores only the token's SHA-256;
// the raw token lives in the httpOnly cookie.

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding expiry is pushed forward at most this often, so most requests don't write. */
const RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Every user column except the password hash. */
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  canProjects: true,
  canComponents: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: PrismaClient, userId: number, now = new Date()) {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  // Housekeeping: drop this user's expired sessions while we're here.
  await db.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
  return { token, expiresAt };
}

/** The session and user behind a cookie token, or null if it's unknown, expired or the user is inactive. */
export async function resolveSession(db: PrismaClient, token: string, now = new Date()) {
  const id = hashToken(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { select: publicUserSelect } },
  });
  if (!session) return null;
  if (session.expiresAt <= now || !session.user.active) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }

  let { expiresAt } = session;
  const renewed = expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - RENEW_INTERVAL_MS;
  if (renewed) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.session.update({ where: { id }, data: { expiresAt } });
  }
  return { sessionId: id, user: session.user, expiresAt, renewed };
}
