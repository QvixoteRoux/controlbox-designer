import {
  ApiErrorBody,
  LayoutChangesResult,
  LayoutDetail,
  Placement,
  positionOnRail,
} from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, builtInRail, db, login, resetDb } from "../../test/helpers.js";
import { releaseRevision } from "../services/revisions.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());

type Cookies = Record<string, string>;
let designer: Cookies;
let viewer: Cookies;
let userId: number;
let machineId: number;
let cab: string;
let cabinetId: number;
let rail: { id: number };
let contactor: { id: number };

beforeEach(async () => {
  await resetDb();
  const user = await addUser("designer", { role: "DESIGNER" });
  userId = user.id;
  await addUser("viewer");
  designer = await login(app, "designer");
  viewer = await login(app, "viewer");

  const type = await db.cabinetType.create({ data: { name: "Control" } });
  const project = await db.project.create({
    data: { name: "P", customer: "C", createdById: user.id },
  });
  const machine = await db.machine.create({
    data: { projectId: project.id, name: "M", createdById: user.id },
  });
  const revision = await db.machineRevision.create({
    data: { machineId: machine.id, rev: 1, createdById: user.id },
  });
  machineId = machine.id;
  const cabinet = await db.cabinet.create({
    data: {
      revisionId: revision.id,
      number: 1,
      typeId: type.id,
      material: "METAL",
      height: 6000,
      width: 4000,
      depth: 2000,
      mainVoltage: "400VAC",
    },
  });
  cabinetId = cabinet.id;
  await db.platen.create({ data: { cabinetId, height: 5500, width: 3500 } });
  cab = `/api/projects/${project.id}/machines/${machine.id}/revisions/1/cabinets/${cabinet.id}`;

  rail = await builtInRail();
  contactor = await db.component.create({
    data: {
      manufacturer: "Acme",
      partNumber: "K-1",
      height: 900,
      width: 450,
      depth: 800,
      railMount: true,
      railEdgeOffset: 200,
    },
  });
});

const call = (
  cookies: Cookies,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });

async function place(body: object) {
  const res = await call(designer, "POST", `${cab}/placements`, body);
  expect(res.statusCode, res.body).toBe(201);
  return Placement.parse(res.json());
}

const layout = async (cookies = viewer) =>
  LayoutDetail.parse((await call(cookies, "GET", `${cab}/layout`)).json());

describe("placing parts", () => {
  it("places a part on top of the others, drawn from the live catalog", async () => {
    const first = await place({ componentId: contactor.id, x: 100, y: 200 });
    const second = await place({ componentId: contactor.id, x: 600, y: 200, tag: "-K2" });

    expect(first).toMatchObject({ x: 100, y: 200, rotation: 0, length: null, locked: false });
    expect(second.zIndex).toBeGreaterThan(first.zIndex);
    expect(second.part).toMatchObject({ partNumber: "K-1", width: 450, active: true });

    const l = await layout();
    expect(l.platen).toMatchObject({ width: 3500, height: 5500 });
    expect(l.placements.map((p) => p.tag)).toEqual([null, "-K2"]);
  });

  it("gives a rail its stock length unless a length is given", async () => {
    expect((await place({ componentId: rail.id, x: 0, y: 0 })).length).toBe(20000);
    expect((await place({ componentId: rail.id, x: 0, y: 0, length: 3000 })).length).toBe(3000);
  });

  it("refuses a length on parts that aren't rails or gutters", async () => {
    const res = await call(designer, "POST", `${cab}/placements`, {
      componentId: contactor.id,
      x: 0,
      y: 0,
      length: 100,
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses inactive parts and cabinets without a platen", async () => {
    await db.component.update({ where: { id: contactor.id }, data: { active: false } });
    const inactive = await call(designer, "POST", `${cab}/placements`, {
      componentId: contactor.id,
      x: 0,
      y: 0,
    });
    expect(inactive.statusCode).toBe(400);

    await db.cabinet.update({ where: { id: cabinetId }, data: { hasPlaten: false } });
    const noPlaten = await call(designer, "POST", `${cab}/placements`, {
      componentId: rail.id,
      x: 0,
      y: 0,
    });
    expect(noPlaten.statusCode).toBe(409);
  });

  it("needs the Projects permission", async () => {
    const res = await call(viewer, "POST", `${cab}/placements`, {
      componentId: rail.id,
      x: 0,
      y: 0,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("editing placements", () => {
  it("moves, rotates, retags and resizes", async () => {
    const r = await place({ componentId: rail.id, x: 0, y: 0 });

    const res = await call(designer, "PATCH", `${cab}/placements/${r.id}`, {
      x: 500,
      y: 700,
      rotation: 90,
      length: 4000,
      tag: "",
    });

    expect(Placement.parse(res.json())).toMatchObject({
      x: 500,
      y: 700,
      rotation: 90,
      length: 4000,
      tag: null,
    });
  });

  it("only rotates to 0° or 90°", async () => {
    const p = await place({ componentId: contactor.id, x: 0, y: 0 });
    const url = `${cab}/placements/${p.id}`;
    expect((await call(designer, "PATCH", url, { rotation: 180 })).statusCode).toBe(400);
    expect((await call(designer, "PATCH", url, { rotation: 270 })).statusCode).toBe(400);
    const added = await call(designer, "POST", `${cab}/placements`, {
      componentId: contactor.id,
      x: 0,
      y: 0,
      rotation: 270,
    });
    expect(added.statusCode).toBe(400);
  });

  it("refuses edits and deletes while locked, except unlocking", async () => {
    const p = await place({ componentId: contactor.id, x: 0, y: 0 });
    const url = `${cab}/placements/${p.id}`;
    await call(designer, "PATCH", url, { locked: true });

    const move = await call(designer, "PATCH", url, { x: 50 });
    const del = await call(designer, "DELETE", url);
    expect(move.statusCode).toBe(409);
    expect(ApiErrorBody.parse(move.json()).message).toMatch(/locked/);
    expect(del.statusCode).toBe(409);

    const unlockAndMove = await call(designer, "PATCH", url, { locked: false, x: 50 });
    expect(Placement.parse(unlockAndMove.json())).toMatchObject({ locked: false, x: 50 });
    expect((await call(designer, "DELETE", url)).statusCode).toBe(204);
  });

  it("only reaches placements on this cabinet", async () => {
    const p = await place({ componentId: contactor.id, x: 0, y: 0 });
    const other = cab.replace(/cabinets\/\d+$/, "cabinets/99999");
    expect(
      (await call(designer, "PATCH", `${other}/placements/${p.id}`, { x: 1 })).statusCode,
    ).toBe(404);
  });
});

describe("parts on rails", () => {
  /** A 300 mm rail from (50, 100) mm and a contactor 30 mm along it. */
  async function railWithPart() {
    const r = await place({ componentId: rail.id, x: 500, y: 1000, length: 3000 });
    const k = await place({ componentId: contactor.id, x: 800, y: 800, railId: r.id });
    return { r, k };
  }
  const byId = async (id: number) => (await layout()).placements.find((p) => p.id === id);

  it("snaps a rail-mounted part onto a rail of this platen", async () => {
    const { r, k } = await railWithPart();
    expect(k.railId).toBe(r.id);

    const off = await call(designer, "PATCH", `${cab}/placements/${k.id}`, { railId: null });
    expect(Placement.parse(off.json()).railId).toBeNull();
  });

  it("refuses rails that aren't rails, parts that don't mount on rails, and the wrong turn", async () => {
    const { r, k } = await railWithPart();
    const button = await db.component.create({
      data: { manufacturer: "Acme", partNumber: "PB", height: 300, width: 300, depth: 300 },
    });
    const bad = [
      { componentId: contactor.id, x: 0, y: 0, railId: k.id }, // not a rail
      { componentId: button.id, x: 0, y: 0, railId: r.id }, // not rail-mounted
      { componentId: contactor.id, x: 0, y: 0, rotation: 90, railId: r.id }, // rail is horizontal
      { componentId: contactor.id, x: 0, y: 0, railId: 99999 },
    ];
    for (const body of bad) {
      expect((await call(designer, "POST", `${cab}/placements`, body)).statusCode).toBe(400);
    }
    const turn = await call(designer, "PATCH", `${cab}/placements/${k.id}`, { rotation: 90 });
    expect(turn.statusCode).toBe(400);
  });

  it("moves the parts with their rail, locked ones too", async () => {
    const { r, k } = await railWithPart();
    await call(designer, "PATCH", `${cab}/placements/${k.id}`, { locked: true });

    const res = await call(designer, "PATCH", `${cab}/placements/${r.id}`, { x: 700, y: 2000 });
    expect(res.statusCode, res.body).toBe(200);
    expect(await byId(k.id)).toMatchObject({ x: 1000, y: 1800, rotation: 0, railId: r.id });
  });

  it("turns the parts when the rail turns vertical", async () => {
    const { r, k } = await railWithPart();
    const res = await call(designer, "PATCH", `${cab}/placements/${r.id}`, {
      rotation: 90,
      x: 1000,
      y: 500,
    });
    const turned = Placement.parse(res.json());
    expect(await byId(k.id)).toMatchObject({
      ...positionOnRail(turned, (await byId(k.id))!.part, 300),
      rotation: 90,
    });
  });

  it("lets go of the parts when the rail is deleted", async () => {
    const { r, k } = await railWithPart();
    expect((await call(designer, "DELETE", `${cab}/placements/${r.id}`)).statusCode).toBe(204);
    expect(await byId(k.id)).toMatchObject({ railId: null, x: 800, y: 800 });
  });
});

describe("terminal strips", () => {
  const terminalPart = (kind: "TERMINAL_BLOCK" | "GROUND_TERMINAL", levels = 2) =>
    db.component.create({
      data: {
        kind,
        manufacturer: "Weidmüller",
        partNumber: `WDU-${kind}-${levels}`,
        height: 600,
        width: 51,
        depth: 465,
        railMount: true,
        railEdgeOffset: 125,
        stackable: true,
        attributes: kind === "TERMINAL_BLOCK" ? { levels } : {},
      },
    });

  it("places a light grey terminal block strip, then edits it", async () => {
    const t = await terminalPart("TERMINAL_BLOCK");
    const strip = await place({ componentId: t.id, x: 0, y: 0, count: 10, groupLabel: "X1" });
    expect(strip).toMatchObject({
      count: 10,
      color: "LIGHT_GREY",
      groupLabel: "X1",
      bridgedLevels: [],
    });

    const res = await call(designer, "PATCH", `${cab}/placements/${strip.id}`, {
      count: 12,
      color: "BLUE",
      bridgedLevels: [2, 1],
      groupLabel: "",
    });
    expect(Placement.parse(res.json())).toMatchObject({
      count: 12,
      color: "BLUE",
      bridgedLevels: [1, 2],
      groupLabel: null,
    });
  });

  it("only bridges levels the terminal has", async () => {
    const t = await terminalPart("TERMINAL_BLOCK", 2);
    const strip = await place({ componentId: t.id, x: 0, y: 0 });
    const res = await call(designer, "PATCH", `${cab}/placements/${strip.id}`, {
      bridgedLevels: [3],
    });
    expect(res.statusCode).toBe(400);
    expect(ApiErrorBody.parse(res.json()).message).toMatch(/2 levels/);
  });

  it("gives ground terminals a count only", async () => {
    const pe = await terminalPart("GROUND_TERMINAL");
    const strip = await place({ componentId: pe.id, x: 0, y: 0, count: 4 });
    expect(strip).toMatchObject({ count: 4, color: null });
    for (const patch of [{ color: "RED" }, { groupLabel: "PE" }, { bridgedLevels: [1] }]) {
      const res = await call(designer, "PATCH", `${cab}/placements/${strip.id}`, patch);
      expect(res.statusCode).toBe(400);
    }
  });

  it("is only for terminals", async () => {
    const res = await call(designer, "POST", `${cab}/placements`, {
      componentId: contactor.id,
      x: 0,
      y: 0,
      count: 3,
    });
    expect(res.statusCode).toBe(400);
    const one = await place({ componentId: contactor.id, x: 0, y: 0 });
    expect(one).toMatchObject({ count: 1, color: null, groupLabel: null, bridgedLevels: [] });
  });
});

describe("batches of changes", () => {
  const batch = (changes: object[], cookies = designer) =>
    call(cookies, "POST", `${cab}/layout/changes`, { changes });

  it("applies several changes in one go and returns the whole layout", async () => {
    const a = await place({ componentId: contactor.id, x: 0, y: 0 });
    const b = await place({ componentId: contactor.id, x: 500, y: 0 });

    const res = await batch([
      { op: "update", id: a.id, patch: { x: 100 } },
      { op: "update", id: b.id, patch: { x: 600 } },
      { op: "create", tempId: -1, componentId: contactor.id, x: 1000, y: 0, tag: "-K3" },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    const result = LayoutChangesResult.parse(res.json());
    expect(result.placements.map((p) => [p.x, p.tag])).toEqual([
      [100, null],
      [600, null],
      [1000, "-K3"],
    ]);
    expect(result.created).toEqual([{ tempId: -1, id: result.placements[2]!.id }]);
  });

  it("is all or nothing", async () => {
    const a = await place({ componentId: contactor.id, x: 0, y: 0 });
    const locked = await place({ componentId: contactor.id, x: 500, y: 0 });
    await call(designer, "PATCH", `${cab}/placements/${locked.id}`, { locked: true });

    const res = await batch([
      { op: "update", id: a.id, patch: { x: 100 } },
      { op: "delete", id: locked.id },
    ]);
    expect(res.statusCode).toBe(409);
    expect((await layout()).placements.find((p) => p.id === a.id)?.x).toBe(0);
  });

  it("puts a deleted rail back with its parts on it (undo)", async () => {
    const r = await place({ componentId: rail.id, x: 500, y: 1000, length: 3000 });
    const k = await place({ componentId: contactor.id, x: 800, y: 800, railId: r.id });
    await batch([{ op: "delete", id: r.id }]);

    const res = await batch([
      {
        op: "create",
        tempId: -1,
        componentId: rail.id,
        x: 500,
        y: 1000,
        length: 3000,
        zIndex: r.zIndex,
      },
      { op: "update", id: k.id, patch: { railId: -1 } },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    const { placements, created } = LayoutChangesResult.parse(res.json());
    const newRail = created[0]!.id;
    expect(placements.find((p) => p.id === k.id)).toMatchObject({ railId: newRail, x: 800 });
    expect(placements.find((p) => p.id === newRail)).toMatchObject({ zIndex: r.zIndex });
  });

  it("needs the projects permission and a working revision", async () => {
    const a = await place({ componentId: contactor.id, x: 0, y: 0 });
    const change = [{ op: "update", id: a.id, patch: { x: 5 } }];
    expect((await batch(change, viewer)).statusCode).toBe(403);
    await releaseRevision(db, machineId, 1, userId, "First release");
    expect((await batch(change)).statusCode).toBe(409);
  });
});

describe("a released layout", () => {
  it("is read-only and drawn from the release snapshot", async () => {
    const p = await place({ componentId: contactor.id, x: 0, y: 0 });
    await releaseRevision(db, machineId, 1, userId, "First release");
    await db.component.update({ where: { id: contactor.id }, data: { width: 999 } });

    const l = await layout();
    expect(l.context.revision.status).toBe("RELEASED");
    expect(l.placements[0]?.part.width).toBe(450);

    const move = await call(designer, "PATCH", `${cab}/placements/${p.id}`, { x: 10 });
    expect(move.statusCode).toBe(409);
  });
});
