import type {
  CatalogTypeKind,
  CreateCatalogTypeInput,
  UpdateCatalogTypeInput,
} from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

// Cabinet types and component types: two small lookup lists managed the same way
// (guidelines/data-model.md). A type in use is never hard-deleted; deactivate it instead.

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const LABEL: Record<CatalogTypeKind, string> = {
  "cabinet-types": "cabinet type",
  "component-types": "component type",
};

const nameTaken = (kind: CatalogTypeKind, name: string | undefined) =>
  new HttpError(409, `A ${LABEL[kind]} "${name}" already exists`);

const orderBy = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

/** Every type, inactive ones included, with how many rows use it. */
async function findAll(db: PrismaClient, kind: CatalogTypeKind) {
  if (kind === "cabinet-types") {
    const rows = await db.cabinetType.findMany({
      orderBy,
      include: { _count: { select: { cabinets: true } } },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, uses: _count.cabinets }));
  }
  const rows = await db.componentType.findMany({
    orderBy,
    include: { _count: { select: { components: true } } },
  });
  return rows.map(({ _count, ...t }) => ({ ...t, uses: _count.components }));
}

export async function listTypes(db: PrismaClient, kind: CatalogTypeKind) {
  return (await findAll(db, kind)).map(({ uses, ...t }) => ({ ...t, inUse: uses > 0 }));
}

async function findOne(db: PrismaClient, kind: CatalogTypeKind, id: number) {
  const type = (await findAll(db, kind)).find((t) => t.id === id);
  if (!type)
    throw new HttpError(
      404,
      `${LABEL[kind]} not found`.replace(/^./, (c) => c.toUpperCase()),
    );
  return type;
}

/** New types go to the end of the list unless a sort order is given. */
export async function createType(
  db: PrismaClient,
  kind: CatalogTypeKind,
  input: CreateCatalogTypeInput,
) {
  const sortOrder = input.sortOrder ?? (await nextSortOrder(db, kind));
  const data = { name: input.name, sortOrder };
  try {
    return kind === "cabinet-types"
      ? await db.cabinetType.create({ data })
      : await db.componentType.create({ data });
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken(kind, input.name);
    throw err;
  }
}

async function nextSortOrder(db: PrismaClient, kind: CatalogTypeKind) {
  const agg =
    kind === "cabinet-types"
      ? await db.cabinetType.aggregate({ _max: { sortOrder: true } })
      : await db.componentType.aggregate({ _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

export async function updateType(
  db: PrismaClient,
  kind: CatalogTypeKind,
  id: number,
  patch: UpdateCatalogTypeInput,
) {
  await findOne(db, kind, id);
  try {
    return kind === "cabinet-types"
      ? await db.cabinetType.update({ where: { id }, data: patch })
      : await db.componentType.update({ where: { id }, data: patch });
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken(kind, patch.name);
    throw err;
  }
}

/** Only unused types can be deleted (CLAUDE.md rule 7). */
export async function deleteType(db: PrismaClient, kind: CatalogTypeKind, id: number) {
  const type = await findOne(db, kind, id);
  if (type.uses > 0) {
    const what = kind === "cabinet-types" ? "cabinet(s)" : "component(s)";
    throw new HttpError(
      409,
      `${type.name} is used by ${type.uses} ${what}. Deactivate it instead.`,
    );
  }
  if (kind === "cabinet-types") await db.cabinetType.delete({ where: { id } });
  else await db.componentType.delete({ where: { id } });
}
