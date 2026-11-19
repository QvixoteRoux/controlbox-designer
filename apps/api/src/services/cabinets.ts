import {
  canMountInHole,
  defaultPlatenSize,
  defaultWindows,
  doorProblem,
  gridPositions,
  type CreateCabinetInput,
  type GlandArrayInput,
  type OpeningInput,
  type UpdateCabinetInput,
  type UpdatePlatenInput,
} from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { inEditableRevision, revisionSummaryInclude } from "./revisions.js";

// Cabinets, their platen and their openings, all inside one machine revision. Every write runs
// through inEditableRevision(), so released revisions stay read-only (guidelines/revisions.md).

type Tx = Prisma.TransactionClient;

export interface RevisionRef {
  projectId: number;
  machineId: number;
  rev: number;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** The revision addressed by the URL, checking it belongs to that machine and project. */
export async function findRevision(
  db: PrismaClient | Tx,
  { projectId, machineId, rev }: RevisionRef,
) {
  const revision = await db.machineRevision.findUnique({
    where: { machineId_rev: { machineId, rev } },
    include: {
      ...revisionSummaryInclude,
      machine: {
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (revision?.machine.projectId !== projectId) throw new HttpError(404, "Revision not found");
  return revision;
}

export const contextOf = (revision: Awaited<ReturnType<typeof findRevision>>) => ({
  project: revision.machine.project,
  machine: { id: revision.machine.id, name: revision.machine.name },
  revision: { id: revision.id, rev: revision.rev, status: revision.status },
});

/** 404 unless the cabinet belongs to the revision. */
export async function findCabinet(db: PrismaClient | Tx, revisionId: number, cabinetId: number) {
  const cabinet = await db.cabinet.findUnique({ where: { id: cabinetId } });
  if (cabinet?.revisionId !== revisionId) throw new HttpError(404, "Cabinet not found");
  return cabinet;
}

// ── Reads ──

export function listCabinetTypes(db: PrismaClient) {
  return db.cabinetType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getRevisionDetail(db: PrismaClient, ref: RevisionRef) {
  const revision = await findRevision(db, ref);
  const [cabinets, working] = await Promise.all([
    db.cabinet.findMany({
      where: { revisionId: revision.id },
      orderBy: { number: "asc" },
      include: { type: { select: { name: true } }, openings: { select: { kind: true } } },
    }),
    db.machineRevision.findFirst({
      where: { machineId: ref.machineId, status: "WORKING" },
      select: { rev: true },
    }),
  ]);

  const { machine: _m, ...summary } = revision;
  return {
    ...contextOf(revision),
    revision: summary,
    workingRev: working?.rev ?? null,
    cabinets: cabinets.map(({ type, openings, ...c }) => ({
      id: c.id,
      number: c.number,
      material: c.material,
      height: c.height,
      width: c.width,
      depth: c.depth,
      hasPlaten: c.hasPlaten,
      mainVoltage: c.mainVoltage,
      otherVoltages: c.otherVoltages,
      type: type.name,
      hasWindow: openings.some((o) => o.kind === "WINDOW"),
      openingCount: openings.length,
    })),
  };
}

const openingInclude = {
  gland: { select: { id: true, size: true, holeDiameter: true } },
  component: {
    select: {
      id: true,
      kind: true,
      manufacturer: true,
      partNumber: true,
      code: true,
      description: true,
    },
  },
} as const satisfies Prisma.CabinetOpeningInclude;

export async function getCabinet(db: PrismaClient, ref: RevisionRef, cabinetId: number) {
  const revision = await findRevision(db, ref);
  await findCabinet(db, revision.id, cabinetId);
  const cabinet = await db.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    include: {
      type: true,
      platen: true,
      openings: { include: openingInclude, orderBy: [{ face: "asc" }, { id: "asc" }] },
    },
  });
  return { ...cabinet, context: contextOf(revision) };
}

// ── Cabinet writes ──

async function assertTypeUsable(tx: Tx, typeId: number) {
  const type = await tx.cabinetType.findUnique({ where: { id: typeId } });
  if (!type?.active) throw new HttpError(400, "Unknown or inactive cabinet type");
}

const numberTaken = (n: number | undefined) =>
  new HttpError(409, `Cabinet ${n} already exists in this revision`);

/** Creates the cabinet with its default platen (50 mm smaller each way). */
export async function createCabinet(db: PrismaClient, ref: RevisionRef, input: CreateCabinetInput) {
  const revision = await findRevision(db, ref);
  try {
    return await inEditableRevision(db, revision.id, async (tx) => {
      await assertTypeUsable(tx, input.typeId);
      const number =
        input.number ??
        ((
          await tx.cabinet.aggregate({ where: { revisionId: revision.id }, _max: { number: true } })
        )._max.number ?? 0) + 1;

      const cabinet = await tx.cabinet.create({
        data: { ...input, number, revisionId: revision.id },
      });
      await tx.platen.create({ data: { cabinetId: cabinet.id, ...defaultPlatenSize(cabinet) } });
      return cabinet;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw numberTaken(input.number);
    throw err;
  }
}

export async function updateCabinet(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  patch: UpdateCabinetInput,
) {
  const revision = await findRevision(db, ref);
  try {
    return await inEditableRevision(db, revision.id, async (tx) => {
      const current = await findCabinet(tx, revision.id, cabinetId);
      if (patch.typeId !== undefined) await assertTypeUsable(tx, patch.typeId);
      const data = withDoors(current, patch);
      const problem = doorProblem({ ...current, ...data });
      if (problem) throw new HttpError(400, problem.message);
      return tx.cabinet.update({ where: { id: cabinetId }, data });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw numberTaken(patch.number);
    throw err;
  }
}

/**
 * Switching doors brings the hinge side and mounting along unless they're given: 2 doors →
 * hinged BOTH, mounted TOP; back to 1 door → hinged LEFT.
 */
function withDoors(current: { hingeSide: string }, patch: UpdateCabinetInput): UpdateCabinetInput {
  if (patch.doors === 2) {
    return { ...patch, hingeSide: patch.hingeSide ?? "BOTH", upFace: patch.upFace ?? "TOP" };
  }
  if (patch.doors === 1 && patch.hingeSide === undefined && current.hingeSide === "BOTH") {
    return { ...patch, hingeSide: "LEFT" };
  }
  return patch;
}

export async function deleteCabinet(db: PrismaClient, ref: RevisionRef, cabinetId: number) {
  const revision = await findRevision(db, ref);
  await inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    await tx.cabinet.delete({ where: { id: cabinetId } });
  });
}

/** Sets the platen size (creating the row if it's missing). Doesn't touch `hasPlaten`. */
export async function updatePlaten(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  size: UpdatePlatenInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    return tx.platen.upsert({
      where: { cabinetId },
      create: { cabinetId, ...size },
      update: size,
    });
  });
}

/**
 * The "Window: yes / no" switch. Yes adds the default window (one per door) when there's none; no removes every
 * window on the cabinet. Window yes/no itself is never stored (guidelines/data-model.md).
 */
export async function setWindow(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  hasWindow: boolean,
) {
  const revision = await findRevision(db, ref);
  await inEditableRevision(db, revision.id, async (tx) => {
    const cabinet = await findCabinet(tx, revision.id, cabinetId);
    if (!hasWindow) {
      await tx.cabinetOpening.deleteMany({ where: { cabinetId, kind: "WINDOW" } });
      return;
    }
    const existing = await tx.cabinetOpening.count({ where: { cabinetId, kind: "WINDOW" } });
    if (existing === 0) {
      await tx.cabinetOpening.createMany({
        data: defaultWindows(cabinet).map((w) => ({ cabinetId, ...w })),
      });
    }
  });
}

// ── Openings ──

/** Maps the input to columns, clearing the size fields that don't belong to its kind. */
function openingData(input: OpeningInput) {
  const common = {
    kind: input.kind,
    face: input.face,
    x: input.x,
    y: input.y,
    label: input.label,
    width: null,
    height: null,
    diameter: null,
    glandId: null,
    componentId: null,
  };
  switch (input.kind) {
    case "WINDOW":
    case "RECT_HOLE":
      return { ...common, width: input.width, height: input.height };
    case "ROUND_HOLE":
      return { ...common, diameter: input.diameter, componentId: input.componentId };
    case "CABLE_GLAND":
      return { ...common, glandId: input.glandId };
  }
}

/** New gland choices must be active; an opening may keep a gland that was deactivated later. */
async function assertGlandUsable(tx: Tx, glandId: number, currentGlandId: number | null) {
  const gland = await tx.cableGland.findUnique({ where: { id: glandId } });
  if (!gland) throw new HttpError(400, "Unknown cable gland");
  if (!gland.active && gland.id !== currentGlandId) {
    throw new HttpError(400, `Cable gland ${gland.size} is no longer active`);
  }
}

/**
 * A component newly mounted in a hole must be active and of a kind that fits in a hole; an
 * opening may keep a component that was deactivated later.
 */
async function assertComponentMountable(
  tx: Tx,
  componentId: number | null,
  currentComponentId: number | null,
) {
  if (componentId === null || componentId === currentComponentId) return;
  const component = await tx.component.findUnique({ where: { id: componentId } });
  if (!component) throw new HttpError(400, "Unknown component");
  if (!canMountInHole(component.kind)) {
    throw new HttpError(400, `${component.partNumber} can't be mounted in a hole`);
  }
  if (!component.active) {
    throw new HttpError(400, `Component ${component.partNumber} is no longer active`);
  }
}

async function findOpening(tx: Tx, cabinetId: number, openingId: number) {
  const opening = await tx.cabinetOpening.findUnique({ where: { id: openingId } });
  if (opening?.cabinetId !== cabinetId) throw new HttpError(404, "Opening not found");
  return opening;
}

export async function createOpening(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  input: OpeningInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    if (input.kind === "CABLE_GLAND") await assertGlandUsable(tx, input.glandId, null);
    if (input.kind === "ROUND_HOLE") await assertComponentMountable(tx, input.componentId, null);
    return tx.cabinetOpening.create({
      data: { cabinetId, ...openingData(input) },
      include: openingInclude,
    });
  });
}

/**
 * Creates a columns × rows grid of gland openings, all or nothing. They're ordinary openings
 * afterwards: edited and deleted one by one. Overlaps and holes off the face are allowed (the
 * UI warns before saving and highlights them after).
 */
export async function createGlandArray(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  input: GlandArrayInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    await assertGlandUsable(tx, input.glandId, null);
    const positions = gridPositions(input);
    const numbered = positions.length > 1 && input.label !== null;

    const created = [];
    for (const [i, p] of positions.entries()) {
      created.push(
        await tx.cabinetOpening.create({
          data: {
            cabinetId,
            kind: "CABLE_GLAND",
            face: input.face,
            x: p.x,
            y: p.y,
            glandId: input.glandId,
            label: numbered ? `${input.label}${i + 1}` : input.label,
          },
          include: openingInclude,
        }),
      );
    }
    return created;
  });
}

/** Replaces an opening (its kind may change). Only round holes keep a mounted component. */
export async function replaceOpening(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  openingId: number,
  input: OpeningInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    const current = await findOpening(tx, cabinetId, openingId);
    if (input.kind === "CABLE_GLAND") await assertGlandUsable(tx, input.glandId, current.glandId);
    if (input.kind === "ROUND_HOLE") {
      await assertComponentMountable(tx, input.componentId, current.componentId);
    }
    return tx.cabinetOpening.update({
      where: { id: openingId },
      data: openingData(input),
      include: openingInclude,
    });
  });
}

export async function deleteOpening(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  openingId: number,
) {
  const revision = await findRevision(db, ref);
  await inEditableRevision(db, revision.id, async (tx) => {
    await findCabinet(tx, revision.id, cabinetId);
    await findOpening(tx, cabinetId, openingId);
    await tx.cabinetOpening.delete({ where: { id: openingId } });
  });
}
