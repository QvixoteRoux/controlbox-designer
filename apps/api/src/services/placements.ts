import {
  isProfile,
  PlacementSnapshot,
  stockLength,
  type CreatePlacementInput,
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

/** Only rails and gutters have a length. */
function assertLengthFits(component: Component, length: number | null | undefined) {
  if (length != null && !isProfile(component.kind)) {
    throw new HttpError(400, "Only rails and gutters have a length");
  }
}

export async function createPlacement(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  input: CreatePlacementInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    const platen = await findPlaten(tx, revision.id, cabinetId);
    const component = await tx.component.findUnique({ where: { id: input.componentId } });
    if (!component?.active) throw new HttpError(400, "Unknown or inactive component");
    assertLengthFits(component, input.length);

    // New parts go on top.
    const top = await tx.placement.aggregate({
      where: { platenId: platen.id },
      _max: { zIndex: true },
    });
    const created = await tx.placement.create({
      data: {
        platenId: platen.id,
        componentId: component.id,
        x: input.x,
        y: input.y,
        rotation: input.rotation,
        length: isProfile(component.kind) ? (input.length ?? stockLength(component)) : null,
        tag: input.tag,
        zIndex: (top._max.zIndex ?? -1) + 1,
      },
      include: { component: true },
    });
    return toPlacement(created);
  });
}

/** Moves, rotates, resizes, retags or (un)locks. A locked placement only accepts `locked`. */
export async function updatePlacement(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  placementId: number,
  patch: UpdatePlacementInput,
) {
  const revision = await findRevision(db, ref);
  return inEditableRevision(db, revision.id, async (tx) => {
    const platen = await findPlaten(tx, revision.id, cabinetId);
    const current = await findPlacement(tx, platen.id, placementId);
    const changesMoreThanLock = Object.keys(patch).some((k) => k !== "locked");
    if (current.locked && patch.locked !== false && changesMoreThanLock) {
      throw new HttpError(409, "This part is locked. Unlock it first.");
    }
    assertLengthFits(current.component, patch.length);
    const updated = await tx.placement.update({
      where: { id: placementId },
      data: patch,
      include: { component: true },
    });
    return toPlacement(updated);
  });
}

export async function deletePlacement(
  db: PrismaClient,
  ref: RevisionRef,
  cabinetId: number,
  placementId: number,
) {
  const revision = await findRevision(db, ref);
  await inEditableRevision(db, revision.id, async (tx) => {
    const platen = await findPlaten(tx, revision.id, cabinetId);
    const current = await findPlacement(tx, platen.id, placementId);
    if (current.locked) throw new HttpError(409, "This part is locked. Unlock it first.");
    await tx.placement.delete({ where: { id: placementId } });
  });
}
