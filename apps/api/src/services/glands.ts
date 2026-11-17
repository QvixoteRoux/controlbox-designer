import type { CreateCableGlandInput, UpdateCableGlandInput } from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

// Minimal cable gland list (guidelines/data-model.md). Glands in use are never hard-deleted:
// they are deactivated instead, and released revisions keep their snapshot.

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const sizeTaken = (size: string | undefined) =>
  new HttpError(409, `A cable gland "${size}" already exists`);

export async function listGlands(db: PrismaClient) {
  const glands = await db.cableGland.findMany({
    orderBy: { size: "asc" },
    include: { _count: { select: { openings: true } } },
  });
  return glands.map(({ _count, ...g }) => ({ ...g, inUse: _count.openings > 0 }));
}

export async function createGland(db: PrismaClient, input: CreateCableGlandInput) {
  try {
    return await db.cableGland.create({ data: input });
  } catch (err) {
    if (isUniqueViolation(err)) throw sizeTaken(input.size);
    throw err;
  }
}

async function findGland(db: PrismaClient, id: number) {
  const gland = await db.cableGland.findUnique({
    where: { id },
    include: { _count: { select: { openings: true } } },
  });
  if (!gland) throw new HttpError(404, "Cable gland not found");
  return gland;
}

export async function updateGland(db: PrismaClient, id: number, patch: UpdateCableGlandInput) {
  await findGland(db, id);
  try {
    return await db.cableGland.update({ where: { id }, data: patch });
  } catch (err) {
    if (isUniqueViolation(err)) throw sizeTaken(patch.size);
    throw err;
  }
}

/** Only unused glands can be deleted; used ones must be deactivated (CLAUDE.md rule 7). */
export async function deleteGland(db: PrismaClient, id: number) {
  const gland = await findGland(db, id);
  if (gland._count.openings > 0) {
    throw new HttpError(
      409,
      `Cable gland ${gland.size} is used by ${gland._count.openings} opening(s). Deactivate it instead.`,
    );
  }
  await db.cableGland.delete({ where: { id } });
}
