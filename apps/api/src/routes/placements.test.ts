import { ApiErrorBody, LayoutDetail, Placement } from "@cabinet-planner/shared";
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
