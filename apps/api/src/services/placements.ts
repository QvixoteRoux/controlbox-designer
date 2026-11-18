import {
  DEFAULT_TERMINAL_COLOR,
  hasStripOptions,
  isProfile,
  isStrip,
  PlacementSnapshot,
  stockLength,
  terminalLevels,
  withPatch,
  type CreatePlacementInput,
  type LayoutChanges,
  type PlacedGeometry,
  type PlacedPart,
  type Rotation,
  type UpdatePlacementInput,
} from "@cabinet-planner/shared";
import { HttpError } from "../errors.js";
import type { Component, Placement, Prisma, PrismaClient } from "../generated/prisma/client.js";
import { contextOf, findCabinet, findRevision, type RevisionRef } from "./cabinets.js";
import { inEditableRevision } from "./revisions.js";

// The platen layout: catalog parts placed on a cabinet's platen (guidelines/platen-editor.md).
// Every write runs through inEditableRevision(), so released layouts stay read-only.

type Tx = Prisma.TransactionClient;

const livePart = (c: Component): PlacedPart => ({
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
  stackable: c.stackable,
  attributes: c.attributes as PlacedPart["attributes"],
  active: c.active,
});

/** Released placements draw from their snapshot; working ones from the live catalog. */
function toPlacement(p: Placement & { component: Component }) {
  const snapshot = p.snapshot === null ? null : PlacementSnapshot.safeParse(p.snapshot);
  const part = snapshot?.success
    ? { ...snapshot.data.component, active: p.component.active }
    : livePart(p.component);
  return {
    id: p.id,
    x: p.x,
    y: p.y,
    rotation: p.rotation as Rotation,
    length: p.length,
    locked: p.locked,
    railId: p.railId,
    tag: p.tag,
    zIndex: p.zIndex,
    count: p.count,
    color: p.color,
    groupLabel: p.groupLabel,
    bridgedLevels: p.bridgedLevels,
    part,
  };
}

const placementOrder = [{ zIndex: "asc" as const }, { id: "asc" as const }];

export async function getLayout(db: PrismaClient, ref: RevisionRef, cabinetId: number) {
  const revision = await findRevision(db, ref);
  const cabinet = await findCabinet(db, revision.id, cabinetId);
  const platen = await db.platen.findUnique({
    where: { cabinetId },
    include: { placements: { include: { component: true }, orderBy: placementOrder } },
  });
  return {
    context: contextOf(revision),
    cabinet: {
      id: cabinet.id,
      number: cabinet.number,
      depth: cabinet.depth,
      hasPlaten: cabinet.hasPlaten,
    },
    platen: platen && {
      id: platen.id,
      cabinetId: platen.cabinetId,
      height: platen.height,
      width: platen.width,
    },
    placements: platen?.placements.map(toPlacement) ?? [],
  };
}

/** The cabinet's platen, for writes: it must be switched on. */
async function findPlaten(tx: Tx, revisionId: number, cabinetId: number) {
  const cabinet = await findCabinet(tx, revisionId, cabinetId);
  const platen = await tx.platen.findUnique({ where: { cabinetId } });
  if (!platen || !cabinet.hasPlaten) {
    throw new HttpError(409, "This cabinet has no platen. Switch it on first.");
  }
  return platen;
}

async function findPlacement(tx: Tx, platenId: number, placementId: number) {
  const placement = await tx.placement.findUnique({
    where: { id: placementId },
    include: { component: true },
  });
  if (placement?.platenId !== platenId) throw new HttpError(404, "Placement not found");
  return placement;
}

/**
 * A part snapped to a rail: the rail is a RAIL placement on the same platen, the part mounts
 * on rails, and it turns with the rail (0° horizontal, 90° vertical).
 */
async function assertRailFits(
  tx: Tx,
  platenId: number,
  component: Component,
  railId: number,
  rotation: number,
) {
  if (!component.railMount || isProfile(component.kind)) {
    throw new HttpError(400, "Only rail-mounted parts can sit on a rail");
  }
  const rail = await tx.placement.findUnique({
    where: { id: railId },
    include: { component: true },
  });
  if (rail?.platenId !== platenId || rail.component.kind !== "RAIL") {
    throw new HttpError(400, "That rail isn't on this platen");
  }
  if (rail.rotation !== rotation) {
    throw new HttpError(400, "A part on a rail turns with the rail");
  }
}

const geometry = (p: Placement & { component: Component }): PlacedGeometry => ({
  id: p.id,
  x: p.x,
  y: p.y,
  rotation: p.rotation as Rotation,
  length: p.length,
  railId: p.railId,
  count: p.count,
  part: livePart(p.component),
});

/** Moving, turning or resizing a rail carries the parts on it (withPatch in packages/shared). */
async function carryRailParts(
  tx: Tx,
  platenId: number,
  railId: number,
  patch: UpdatePlacementInput,
) {
  const all = await tx.placement.findMany({ where: { platenId }, include: { component: true } });
  const before = all.map(geometry);
  const after = withPatch(before, railId, patch);
  for (const [i, p] of after.entries()) {
    const old = before[i]!;
    if (p.id === railId || p.railId !== railId) continue;
    if (p.x !== old.x || p.y !== old.y || p.rotation !== old.rotation) {
      await tx.placement.update({
        where: { id: p.id },
        data: { x: p.x, y: p.y, rotation: p.rotation },
      });
    }
  }
}

/**
 * Terminal strips: a count only for terminal blocks and ground terminals; colour, group label
 * and bridged levels only for terminal blocks, and only levels the terminal has.
 */
function assertStripFits(
  component: Component,
  strip: {
    count?: number;
    color?: string | null;
    groupLabel?: string | null;
    bridgedLevels?: number[];
  },
) {
  if (strip.count !== undefined && strip.count !== 1 && !isStrip(component.kind)) {
    throw new HttpError(400, "Only terminals can be placed as a strip");
  }
  const options =
    (strip.color !== undefined && strip.color !== null) ||
    (strip.groupLabel !== undefined && strip.groupLabel !== null) ||
    (strip.bridgedLevels !== undefined && strip.bridgedLevels.length > 0);
  if (options && !hasStripOptions(component.kind)) {
    throw new HttpError(400, "Only terminal blocks have a colour, group label or bridges");
  }
  const levels = terminalLevels(component);
  if (strip.bridgedLevels?.some((l) => l > levels)) {
    throw new HttpError(400, `This terminal has ${levels} level${levels === 1 ? "" : "s"}`);
  }
}

/** Only rails and gutters have a length. */
function assertLengthFits(component: Component, length: number | null | undefined) {
  if (length != null && !isProfile(component.kind)) {
    throw new HttpError(400, "Only rails and gutters have a length");
  }
}

type CreateFields = Omit<CreatePlacementInput, "railId"> & {
  railId: number | null;
  locked?: boolean;
  zIndex?: number;
};

/** Places a part. New parts go on top unless a z-order is given (undo puts one back). */
async function createIn(tx: Tx, platenId: number, input: CreateFields) {
  const component = await tx.component.findUnique({ where: { id: input.componentId } });
  if (!component?.active) throw new HttpError(400, "Unknown or inactive component");
  assertLengthFits(component, input.length);
  assertStripFits(component, input);
  if (input.railId !== null) {
    await assertRailFits(tx, platenId, component, input.railId, input.rotation);
  }
  const top = await tx.placement.aggregate({ where: { platenId }, _max: { zIndex: true } });
  return tx.placement.create({
    data: {
      platenId,
      componentId: component.id,
      x: input.x,
      y: input.y,
      rotation: input.rotation,
      length: isProfile(component.kind) ? (input.length ?? stockLength(component)) : null,
      railId: input.railId,
      tag: input.tag,
      count: input.count,
      color: hasStripOptions(component.kind) ? (input.color ?? DEFAULT_TERMINAL_COLOR) : null,
      groupLabel: input.groupLabel,
      bridgedLevels: input.bridgedLevels,
      locked: input.locked ?? false,
      zIndex: input.zIndex ?? (top._max.zIndex ?? -1) + 1,
    },
    include: { component: true },
  });
}

/**
 * Moves, rotates, resizes, retags, (un)locks or snaps onto a rail. A locked placement only
 * accepts `locked`. A rail carries the parts on it, locked ones too (they're locked to it).
 */
async function updateIn(
  tx: Tx,
  platenId: number,
  placementId: number,
  patch: UpdatePlacementInput,
) {
  const current = await findPlacement(tx, platenId, placementId);
  const changesMoreThanLock = Object.keys(patch).some((k) => k !== "locked");
  if (current.locked && patch.locked !== false && changesMoreThanLock) {
    throw new HttpError(409, "This part is locked. Unlock it first.");
  }
  assertLengthFits(current.component, patch.length);
  assertStripFits(current.component, patch);
  const railId = patch.railId === undefined ? current.railId : patch.railId;
  if (railId !== null && (patch.railId !== undefined || patch.rotation !== undefined)) {
    await assertRailFits(
      tx,
      platenId,
      current.component,
      railId,
      patch.rotation ?? current.rotation,
    );
  }
  if (current.component.kind === "RAIL") {
    await carryRailParts(tx, platenId, placementId, patch);
  }
  return tx.placement.update({
    where: { id: placementId },
    data: patch,
    include: { component: true },
  });
}

/** Parts on a deleted rail stay where they are, off the rail (FK ON DELETE SET NULL). */
async function deleteIn(tx: Tx, platenId: number, placementId: number) {
  const current = await findPlacement(tx, platenId, placementId);
  if (current.locked) throw new HttpError(409, "This part is locked. Unlock it first.");
  await tx.placement.delete({ where: { id: placementId } });
}

/** Runs one write on the cabinet's platen, in a WORKING revision. */
async function onPlaten<T>(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  write: (tx: Tx, platenId: number) => Promise<T>,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    const platen = await findPlaten(tx, revision.id, cabinetId);
    return write(tx, platen.id);
  });
}

export const createPlacement = (
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  input: CreatePlacementInput,
) =>
  onPlaten(db, ref, cabinetId, async (tx, platenId) =>
    toPlacement(await createIn(tx, platenId, input)),
  );

export const updatePlacement = (
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  placementId: number,
  patch: UpdatePlacementInput,
) =>
  onPlaten(db, ref, cabinetId, async (tx, platenId) =>
    toPlacement(await updateIn(tx, platenId, placementId, patch)),
  );

export const deletePlacement = (
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  placementId: number,
) => onPlaten(db, ref, cabinetId, (tx, platenId) => deleteIn(tx, platenId, placementId));

/**
 * Several changes in one transaction, in order (multi-select moves and deletes, undo/redo).
 * A create carries a negative `tempId`; later changes in the batch can use it as a `railId`
 * (undo puts a deleted rail back, then its parts back on it). All or nothing: any refusal
 * rolls the whole batch back. Returns every placement on the platen afterwards.
 */
export const applyLayoutChanges = (
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  { changes }: LayoutChanges,
) =>
  onPlaten(db, ref, cabinetId, async (tx, platenId) => {
    const created = new Map<number, number>(); // tempId → id
    const real = (id: number) => {
      if (id > 0) return id;
      const mapped = created.get(id);
      if (mapped === undefined) throw new HttpError(400, `Unknown temporary id ${id}`);
      return mapped;
    };
    const railOf = (railId: number | null | undefined) => (railId == null ? railId : real(railId));

    for (const change of changes) {
      if (change.op === "create") {
        const { op: _op, tempId, ...input } = change;
        if (created.has(tempId)) throw new HttpError(400, `Temporary id ${tempId} used twice`);
        const p = await createIn(tx, platenId, { ...input, railId: railOf(input.railId) ?? null });
        created.set(tempId, p.id);
      } else if (change.op === "update") {
        const patch = { ...change.patch };
        if (patch.railId !== undefined) patch.railId = railOf(patch.railId) ?? null;
        await updateIn(tx, platenId, real(change.id), patch);
      } else {
        await deleteIn(tx, platenId, real(change.id));
      }
    }

    const placements = await tx.placement.findMany({
      where: { platenId },
      include: { component: true },
      orderBy: placementOrder,
    });
    return {
      placements: placements.map(toPlacement),
      created: [...created].map(([tempId, id]) => ({ tempId, id })),
    };
  });
