import {
  designerHasPermission,
  type ChangePasswordInput,
  type CreateUserInput,
  type UpdateUserInput,
} from "@cabinet-planner/shared";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { publicUserSelect, type PublicUser } from "../auth/sessions.js";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export function listUsers(db: PrismaClient) {
  return db.user.findMany({ select: publicUserSelect, orderBy: { username: "asc" } });
}

/** The user for these credentials, or null. Inactive users can't log in. */
export async function authenticate(
  db: PrismaClient,
  username: string,
  password: string,
): Promise<PublicUser | null> {
  const found = await db.user.findUnique({
    where: { username },
    select: { ...publicUserSelect, passwordHash: true },
  });
  const ok = await verifyPassword(found?.active ? found.passwordHash : null, password);
  if (!found || !ok) return null;
  const { passwordHash: _, ...user } = found;
  return user;
}

export async function createUser(db: PrismaClient, input: CreateUserInput) {
  const { password, ...fields } = input;
  try {
    return await db.user.create({
      data: { ...fields, passwordHash: await hashPassword(password) },
      select: publicUserSelect,
    });
  } catch (err) {
    // Also hits when only the case differs (users_username_lower_key).
    if (isUniqueViolation(err)) {
      throw new HttpError(
        409,
        `Username "${input.username}" is already taken (upper/lower case doesn't count as different)`,
      );
    }
    throw err;
  }
}

/**
 * Admin edit. Refuses to leave the system without an active ADMIN, and logs a user out
 * everywhere when they're deactivated.
 */
export function updateUser(db: PrismaClient, id: number, patch: UpdateUserInput) {
  return db.$transaction(async (tx) => {
    // Lock every active admin row: two concurrent demotions then queue up here instead of
    // both seeing "another admin is left".
    const activeAdmins = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND active FOR UPDATE`;

    const current = await tx.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!current) throw new HttpError(404, "User not found");

    const next = { ...current, ...patch };
    if (!designerHasPermission(next)) {
      throw new HttpError(400, "A designer needs at least one permission (Projects or Components)");
    }
    const losesAdmin =
      current.role === "ADMIN" && current.active && !(next.role === "ADMIN" && next.active);
    if (losesAdmin && activeAdmins.length <= 1) {
      throw new HttpError(409, "This is the last active admin. Make another user an admin first.");
    }

    const user = await tx.user.update({ where: { id }, data: patch, select: publicUserSelect });
    if (current.active && !next.active) {
      await tx.session.deleteMany({ where: { userId: id } });
    }
    return user;
  });
}

/**
 * Sets a new password and ends the user's sessions, except `keepSessionId`
 * (the caller's own session when they change their own password).
 */
async function setPassword(
  db: PrismaClient,
  userId: number,
  password: string,
  keepSessionId: string | null,
) {
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    db.session.deleteMany({
      where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
    }),
  ]);
}

/** Admin reset. */
export async function resetPassword(
  db: PrismaClient,
  userId: number,
  password: string,
  keepSessionId: string | null,
) {
  const exists = await db.user.count({ where: { id: userId } });
  if (!exists) throw new HttpError(404, "User not found");
  await setPassword(db, userId, password, keepSessionId);
}

/** A user changing their own password: needs the current one; other sessions are logged out. */
export async function changeOwnPassword(
  db: PrismaClient,
  userId: number,
  sessionId: string | null,
  input: ChangePasswordInput,
) {
  const { passwordHash } = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(passwordHash, input.currentPassword))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  await setPassword(db, userId, input.newPassword, sessionId);
}
