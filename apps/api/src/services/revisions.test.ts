import { OpeningSnapshot, PlacementSnapshot } from "@cabinet-planner/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { addCabinetContent } from "../../test/fixtures.js";
import { addUser, db, resetDb } from "../../test/helpers.js";
import { HttpError } from "../errors.js";
import {
  assertRevisionEditable,
  createInitialRevision,
  createNextRevision,
  releaseRevision,
} from "./revisions.js";

let userId: number;
let machineId: number;

beforeEach(async () => {
  await resetDb();
  userId = (await addUser("designer", { role: "DESIGNER" })).id;
  const project = await db.project.create({
    data: { name: "P", customer: "C", createdById: userId },
  });
  machineId = (
    await db.machine.create({ data: { projectId: project.id, name: "M", createdById: userId } })
  ).id;
});

const firstRev = () => createInitialRevision(db, machineId, userId);

describe("assertRevisionEditable", () => {
  it("passes for a WORKING revision", async () => {
    const r = await firstRev();
    await expect(assertRevisionEditable(db, r.id)).resolves.toBeUndefined();
  });

  it("refuses a RELEASED one with 409", async () => {
    const r = await firstRev();
    await releaseRevision(db, machineId, 1, userId, "done");

    const err = await assertRevisionEditable(db, r.id).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).statusCode).toBe(409);
    expect((err as HttpError).message).toMatch(/Rev 001 is released/);
  });

  it("gives 404 for an unknown revision", async () => {
    await expect(assertRevisionEditable(db, 9999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("releaseRevision", () => {
  it("snapshots placements and openings with a gland or component, not plain openings", async () => {
    const r = await firstRev();
    const c = await addCabinetContent(r.id);

    await releaseRevision(db, machineId, 1, userId, "first issue");

    const onRail = await db.placement.findUniqueOrThrow({ where: { id: c.onRail.id } });
    expect(PlacementSnapshot.parse(onRail.snapshot).component).toMatchObject({
      componentId: c.contactor.id,
      partNumber: c.contactor.partNumber,
      width: 450,
      railEdgeOffset: 200,
    });
    const rail = await db.placement.findUniqueOrThrow({ where: { id: c.railPlacement.id } });
    expect(PlacementSnapshot.parse(rail.snapshot).component.attributes).toEqual({
      stockLength: 20000,
    });

    const openings = await db.cabinetOpening.findMany({ orderBy: { id: "asc" } });
    const [window, glandHole, buttonHole] = openings;
    expect(window?.snapshot).toBeNull();
    expect(OpeningSnapshot.parse(glandHole?.snapshot)).toMatchObject({
      gland: { size: c.gland.size, holeDiameter: 205 },
      component: null,
    });
    expect(OpeningSnapshot.parse(buttonHole?.snapshot)).toMatchObject({
      gland: null,
      component: { partNumber: c.pushbutton.partNumber },
    });
  });

  it("keeps showing what was released after the catalog changes", async () => {
    const r = await firstRev();
    const c = await addCabinetContent(r.id);
    await releaseRevision(db, machineId, 1, userId, "first issue");

    await db.component.update({
      where: { id: c.contactor.id },
      data: { width: 999, active: false },
    });

    const onRail = await db.placement.findUniqueOrThrow({ where: { id: c.onRail.id } });
    expect(PlacementSnapshot.parse(onRail.snapshot).component.width).toBe(450);
  });

  it("freezes the type's fill colour too", async () => {
    const r = await firstRev();
    const c = await addCabinetContent(r.id);
    const type = await db.componentType.create({ data: { name: "Relays", fillColor: "#a5d8ff" } });
    await db.component.update({ where: { id: c.contactor.id }, data: { typeId: type.id } });

    await releaseRevision(db, machineId, 1, userId, "first issue");
    await db.componentType.update({ where: { id: type.id }, data: { fillColor: "#ffc9c9" } });

    const onRail = await db.placement.findUniqueOrThrow({ where: { id: c.onRail.id } });
    expect(PlacementSnapshot.parse(onRail.snapshot).component.fillColor).toBe("#a5d8ff");
  });
});

describe("createNextRevision", () => {
  it("deep-copies the released revision into rev + 1, with fresh ids and no snapshots", async () => {
    const r1 = await firstRev();
    const c = await addCabinetContent(r1.id);
    const strip = { count: 8, color: "RED", groupLabel: "X1", bridgedLevels: [1] } as const;
    await db.placement.update({
      where: { id: c.onRail.id },
      data: { ...strip, bridgedLevels: [...strip.bridgedLevels] },
    });
    await releaseRevision(db, machineId, 1, userId, "first issue");

    const r2 = await createNextRevision(db, machineId, userId);

    expect(r2).toMatchObject({ rev: 2, status: "WORKING", basedOnId: r1.id });

    const copy = await db.cabinet.findFirstOrThrow({
      where: { revisionId: r2.id },
      include: { platen: { include: { placements: true } }, openings: true },
    });
    expect(copy.id).not.toBe(c.cabinet.id);
    expect(copy).toMatchObject({
      number: 1,
      height: 6000,
      mainVoltage: "400VAC",
      otherVoltages: ["24VDC"],
    });
    expect(copy.platen).toMatchObject({ height: 5500, width: 3500 });

    const placements = copy.platen!.placements;
    expect(placements).toHaveLength(2);
    expect(placements.every((p) => p.snapshot === null)).toBe(true);
    const newRail = placements.find((p) => p.componentId === c.rail.id)!;
    const newOnRail = placements.find((p) => p.componentId === c.contactor.id)!;
    // The rail link points at the copied rail, not the original one.
    expect(newOnRail.railId).toBe(newRail.id);
    expect(newOnRail).toMatchObject({ x: 400, y: 300, tag: "-K1", ...strip });
    expect(newRail.length).toBe(3000);

    expect(copy.openings).toHaveLength(3);
    expect(copy.openings.every((o) => o.snapshot === null)).toBe(true);
  });

  it("leaves the released revision untouched", async () => {
    const r1 = await firstRev();
    const c = await addCabinetContent(r1.id);
    await releaseRevision(db, machineId, 1, userId, "first issue");

    await createNextRevision(db, machineId, userId);

    const original = await db.placement.findUniqueOrThrow({ where: { id: c.onRail.id } });
    expect(original.railId).toBe(c.railPlacement.id);
    expect(original.snapshot).not.toBeNull();
    expect(await db.cabinet.count({ where: { revisionId: r1.id } })).toBe(1);
  });

  it("refuses to go past Rev 999", async () => {
    await db.machineRevision.create({
      data: {
        machineId,
        rev: 999,
        status: "RELEASED",
        notes: "last",
        createdById: userId,
        releasedById: userId,
        releasedAt: new Date(),
      },
    });

    await expect(createNextRevision(db, machineId, userId)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("database checks", () => {
  it("refuse a released revision without notes", async () => {
    const r = await firstRev();

    await expect(
      db.machineRevision.update({
        where: { id: r.id },
        data: { status: "RELEASED", releasedAt: new Date(), releasedById: userId },
      }),
    ).rejects.toThrow(/machine_revisions_release_notes/);
  });

  it("refuse a second WORKING revision", async () => {
    await firstRev();

    await expect(
      db.machineRevision.create({ data: { machineId, rev: 2, createdById: userId } }),
    ).rejects.toThrow();
  });
});
