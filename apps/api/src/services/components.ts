import { componentColumns, isBuiltIn, type ComponentInput } from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

// The component catalog (guidelines/data-model.md). One table; `kind` decides which fields
// apply. Rows in use (placed on a platen or mounted in a hole) are never hard-deleted.
// The DIN rail is built in (BUILT_IN_RAIL, added by a migration): it can't be added, deleted
// or turned into another kind, and no other part can become a rail.

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const usage = { _count: { select: { placements: true, openings: true } } } as const;
const listInclude = { type: { select: { name: true } }, ...usage } as const;

type Row = Prisma.ComponentGetPayload<{ include: typeof listInclude }>;
const uses = (c: Row) => c._count.placements + c._count.openings;
const toListItem = ({ _count, type, ...c }: Row) => ({
  ...c,
  type: type?.name ?? null,
  inUse: _count.placements + _count.openings > 0,
});

export async function listComponents(db: PrismaClient) {
  const rows = await db.component.findMany({
    include: listInclude,
    orderBy: [{ kind: "asc" }, { manufacturer: "asc" }, { partNumber: "asc" }],
  });
  return rows.map(toListItem);
}

async function findComponent(db: PrismaClient, id: number) {
  const component = await db.component.findUnique({ where: { id }, include: listInclude });
  if (!component) throw new HttpError(404, "Component not found");
  return component;
}

export async function getComponent(db: PrismaClient, id: number) {
  return toListItem(await findComponent(db, id));
}

/** A new type choice must be active; a component may keep a type deactivated later. */
async function assertTypeUsable(
  db: PrismaClient,
  typeId: number | null,
  currentTypeId: number | null,
) {
  if (typeId === null || typeId === currentTypeId) return;
  const type = await db.componentType.findUnique({ where: { id: typeId } });
  if (!type?.active) throw new HttpError(400, "Unknown or inactive component type");
}

type Columns = ReturnType<typeof componentColumns>;

/** Clear 409s for the two unique keys: manufacturer + part number, and code. */
async function assertUnique(db: PrismaClient, input: Columns, id?: number) {
  const notThis = id === undefined ? {} : { id: { not: id } };
  const samePart = await db.component.findFirst({
    where: { manufacturer: input.manufacturer, partNumber: input.partNumber, ...notThis },
  });
  if (samePart) {
    throw new HttpError(409, `${input.manufacturer} ${input.partNumber} is already in the catalog`);
  }
  if (input.code !== null) {
    const sameCode = await db.component.findFirst({ where: { code: input.code, ...notThis } });
    if (sameCode) {
      throw new HttpError(
        409,
        `Code ${input.code} is already used by ${sameCode.manufacturer} ${sameCode.partNumber}`,
      );
    }
  }
}

const conflict = () => new HttpError(409, "Another component already has this part number or code");
const railIsBuiltIn = () =>
  new HttpError(409, "The DIN rail is built in: it's already in the catalog and can't be added");

export async function createComponent(db: PrismaClient, input: ComponentInput) {
  if (isBuiltIn(input)) throw railIsBuiltIn();
  const data = componentColumns(input);
  await assertTypeUsable(db, input.typeId, null);
  await assertUnique(db, data);
  try {
    const created = await db.component.create({ data });
    return getComponent(db, created.id);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict();
    throw err;
  }
}

/**
 * Replaces a component's data. Its kind can only change while nothing uses it: placements and
 * holes depend on it (a rail's length, a hole-mounted part…). The image is kept.
 */
export async function updateComponent(db: PrismaClient, id: number, input: ComponentInput) {
  const current = await findComponent(db, id);
  if (isBuiltIn(current) && input.kind !== current.kind) {
    throw new HttpError(409, "The DIN rail is built in, so its kind can't change");
  }
  if (isBuiltIn(input) && !isBuiltIn(current)) throw railIsBuiltIn();
  if (input.kind !== current.kind && uses(current) > 0) {
    throw new HttpError(409, "This component is in use, so its kind can't change");
  }
  const data = componentColumns(input);
  await assertTypeUsable(db, input.typeId, current.typeId);
  await assertUnique(db, data, id);
  try {
    await db.component.update({ where: { id }, data });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict();
    throw err;
  }
  return getComponent(db, id);
}

/** Only unused components can be deleted (CLAUDE.md rule 7). */
export async function deleteComponent(db: PrismaClient, id: number) {
  const component = await findComponent(db, id);
  if (isBuiltIn(component))
    throw new HttpError(409, "The DIN rail is built in and can't be deleted");
  const n = uses(component);
  if (n > 0) {
    throw new HttpError(
      409,
      `${component.partNumber} is used ${n} time(s) in cabinets. Deactivate it instead.`,
    );
  }
  await db.component.delete({ where: { id } });
}

export async function setComponentImage(db: PrismaClient, id: number, imagePath: string | null) {
  await findComponent(db, id);
  await db.component.update({ where: { id }, data: { imagePath } });
  return getComponent(db, id);
}
