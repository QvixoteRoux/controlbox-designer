import {
  FIRST_REV,
  MAX_REV,
  formatRev,
  type ComponentSnapshot,
  type GlandSnapshot,
  type OpeningSnapshot,
  type PlacementSnapshot,
} from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import type { CableGland, Component, Prisma, PrismaClient } from "../generated/prisma/client.js";

// Revision rules (guidelines/revisions.md): one WORKING revision per machine, RELEASED ones are
// frozen, release snapshots the catalog, a new revision deep-copies the latest released one.

type Db = PrismaClient | Prisma.TransactionClient;

/** Release and copy touch every placement of a machine, so allow more than the 5 s default. */
const LONG_TX = { timeout: 30_000 };

export const revisionSummaryInclude = {
  createdBy: { select: { id: true, displayName: true } },
  releasedBy: { select: { id: true, displayName: true } },
} as const satisfies Prisma.MachineRevisionInclude;

/**
 * Every service that writes revision data (cabinets, openings, platens, placements) calls this
 * first. 404 if the revision doesn't exist, 409 if it's released.
 *
 * Call it inside the same transaction as the write (see `inEditableRevision`): it share-locks the
 * revision row, so a release (which takes FOR UPDATE) waits for in-flight edits and vice versa.
 */
export async function assertRevisionEditable(db: Db, revisionId: number) {
  const [revision] = await db.$queryRaw<{ rev: number; status: string }[]>`
    SELECT rev, status FROM machine_revisions WHERE id = ${revisionId} FOR SHARE`;
  if (!revision) throw new HttpError(404, "Revision not found");
  if (revision.status === "RELEASED") {
    throw new HttpError(
      409,
      `${formatRev(revision.rev)} is released and read-only. Create a new revision to make changes.`,
    );
  }
}

/** Runs `write` in a transaction, after checking (and locking) that the revision is editable. */
export function inEditableRevision<T>(
  db: PrismaClient,
  revisionId: number,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    await assertRevisionEditable(tx, revisionId);
    return write(tx);
  });
}

/** Rev 001 (WORKING) for a new machine. */
export function createInitialRevision(db: Db, machineId: number, userId: number) {
  return db.machineRevision.create({ data: { machineId, rev: FIRST_REV, createdById: userId } });
}

// ── Release ──

const componentSnapshot = (
  c: Component & { type: { fillColor: string | null } | null },
): ComponentSnapshot => ({
  componentId: c.id,
  kind: c.kind,
  manufacturer: c.manufacturer,
  partNumber: c.partNumber,
  code: c.code,
  description: c.description,
  height: c.height,
  width: c.width,
  depth: c.depth,
  railMount: c.railMount,
  railEdgeOffset: c.railEdgeOffset,
  snappable: c.snappable,
  expandable: c.expandable,
  fillColor: c.type?.fillColor ?? null,
  attributes: c.attributes as ComponentSnapshot["attributes"],
  imagePath: c.imagePath,
});

const glandSnapshot = (g: CableGland): GlandSnapshot => ({
  glandId: g.id,
  size: g.size,
  holeDiameter: g.holeDiameter,
  imagePath: g.imagePath,
});

/**
 * Freezes a WORKING revision: copies the catalog data used for drawing into every placement and
 * every opening with a gland or component, then marks it RELEASED. All in one transaction.
 */
export function releaseRevision(
  db: PrismaClient,
  machineId: number,
  rev: number,
  userId: number,
  notes: string,
) {
  return db.$transaction(async (tx) => {
    // Row lock: a concurrent release or edit of this revision waits for us.
    const [revision] = await tx.$queryRaw<{ id: number; status: string }[]>`
      SELECT id, status FROM machine_revisions
      WHERE machine_id = ${machineId} AND rev = ${rev}
      FOR UPDATE`;
    if (!revision) throw new HttpError(404, "Revision not found");
    if (revision.status === "RELEASED") {
      throw new HttpError(409, `${formatRev(rev)} is already released`);
    }

    const placements = await tx.placement.findMany({
      where: { platen: { cabinet: { revisionId: revision.id } } },
      include: { component: { include: { type: true } } },
    });
    for (const p of placements) {
      const snapshot: PlacementSnapshot = { component: componentSnapshot(p.component) };
      await tx.placement.update({ where: { id: p.id }, data: { snapshot } });
    }

    const openings = await tx.cabinetOpening.findMany({
      where: {
        cabinet: { revisionId: revision.id },
        OR: [{ glandId: { not: null } }, { componentId: { not: null } }],
      },
      include: { gland: true, component: { include: { type: true } } },
    });
    for (const o of openings) {
      const snapshot: OpeningSnapshot = {
        gland: o.gland && glandSnapshot(o.gland),
        component: o.component && componentSnapshot(o.component),
      };
      await tx.cabinetOpening.update({ where: { id: o.id }, data: { snapshot } });
    }

    return tx.machineRevision.update({
      where: { id: revision.id },
      data: { status: "RELEASED", notes, releasedAt: new Date(), releasedById: userId },
      include: revisionSummaryInclude,
    });
  }, LONG_TX);
}

// ── New revision ──

/**
 * Starts rev + 1 from the latest (released) revision. Allowed only when the machine has no
 * WORKING revision. Copies cabinets, platens, placements (rail links remapped) and openings;
 * snapshots are left empty so the copy uses the current catalog.
 */
export function createNextRevision(db: PrismaClient, machineId: number, userId: number) {
  return db.$transaction(async (tx) => {
    // Lock the machine so two "new revision" clicks can't both pick the same number.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM machines WHERE id = ${machineId} FOR UPDATE`;
    if (locked.length === 0) throw new HttpError(404, "Machine not found");

    const latest = await tx.machineRevision.findFirst({
      where: { machineId },
      orderBy: { rev: "desc" },
    });
    if (!latest) return createInitialRevision(tx, machineId, userId);
    if (latest.status === "WORKING") {
      throw new HttpError(
        409,
        `${formatRev(latest.rev)} is still being worked on. Release it before starting a new revision.`,
      );
    }
    if (latest.rev >= MAX_REV) {
      throw new HttpError(409, `This machine has reached the last revision number (${MAX_REV})`);
    }

    const next = await tx.machineRevision.create({
      data: { machineId, rev: latest.rev + 1, basedOnId: latest.id, createdById: userId },
    });
    await copyRevisionContent(tx, latest.id, next.id);
    return tx.machineRevision.findUniqueOrThrow({
      where: { id: next.id },
      include: revisionSummaryInclude,
    });
  }, LONG_TX);
}

const json = (value: Prisma.JsonValue) => value as Prisma.InputJsonValue;

async function copyRevisionContent(tx: Prisma.TransactionClient, fromId: number, toId: number) {
  const cabinets = await tx.cabinet.findMany({
    where: { revisionId: fromId },
    include: { platen: { include: { placements: true } }, openings: true },
    orderBy: { number: "asc" },
  });

  for (const { id: _id, revisionId: _rev, platen, openings, ...cabinet } of cabinets) {
    const copy = await tx.cabinet.create({
      data: { ...cabinet, extra: json(cabinet.extra), revisionId: toId },
    });

    if (openings.length > 0) {
      await tx.cabinetOpening.createMany({
        data: openings.map(({ id: _o, cabinetId: _c, snapshot: _s, ...opening }) => ({
          ...opening,
          cabinetId: copy.id,
        })),
      });
    }

    if (!platen) continue;
    const newPlaten = await tx.platen.create({
      data: { cabinetId: copy.id, height: platen.height, width: platen.width },
    });

    // Placements first without rail links, then point each link at the copied rail.
    const newIdOf = new Map<number, number>();
    for (const p of platen.placements) {
      const created = await tx.placement.create({
        data: {
          platenId: newPlaten.id,
          componentId: p.componentId,
          x: p.x,
          y: p.y,
          rotation: p.rotation,
          length: p.length,
          locked: p.locked,
          tag: p.tag,
          zIndex: p.zIndex,
          count: p.count,
          color: p.color,
          groupLabel: p.groupLabel,
          bridgedLevels: p.bridgedLevels,
        },
      });
      newIdOf.set(p.id, created.id);
    }
    for (const p of platen.placements) {
      if (p.railId === null) continue;
      await tx.placement.update({
        where: { id: newIdOf.get(p.id) },
        data: { railId: newIdOf.get(p.railId) ?? null },
      });
    }
  }
}
