import {
  ApiErrorBody,
  Cabinet,
  CabinetDetail,
  Opening,
  Platen,
  RevisionDetail,
} from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, db, login, resetDb } from "../../test/helpers.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());

type Cookies = Record<string, string>;
let designer: Cookies;
let viewer: Cookies;
let typeId: number;
let rev: string;

beforeEach(async () => {
  await resetDb();
  const user = await addUser("designer", { role: "DESIGNER" });
  await addUser("viewer");
  designer = await login(app, "designer");
  viewer = await login(app, "viewer");
  typeId = (await db.cabinetType.create({ data: { name: "Control" } })).id;
  const project = await db.project.create({
    data: { name: "P", customer: "C", createdById: user.id },
  });
  const machine = await db.machine.create({
    data: { projectId: project.id, name: "M", createdById: user.id },
  });
  await db.machineRevision.create({
    data: { machineId: machine.id, rev: 1, createdById: user.id },
  });
  rev = `/api/projects/${project.id}/machines/${machine.id}/revisions/1`;
});

const call = (
  cookies: Cookies,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });

// 600 × 400 × 200 mm, in 0.1 mm.
const cabinetBody = (extra: object = {}) => ({
  typeId,
  material: "METAL",
  height: 6000,
  width: 4000,
  depth: 2000,
  mainVoltage: "400VAC",
  ...extra,
});

async function newCabinet(extra: object = {}) {
  const res = await call(designer, "POST", `${rev}/cabinets`, cabinetBody(extra));
  expect(res.statusCode).toBe(201);
  return Cabinet.parse(res.json());
}

const cabinetUrl = (id: number) => `${rev}/cabinets/${id}`;
const detail = async (id: number) =>
  CabinetDetail.parse((await call(viewer, "GET", cabinetUrl(id))).json());

async function releaseRevision() {
  const userId = (await db.user.findUniqueOrThrow({ where: { username: "designer" } })).id;
  await db.machineRevision.updateMany({
    data: { status: "RELEASED", notes: "issued", releasedAt: new Date(), releasedById: userId },
  });
}

describe("cabinets", () => {
  it("get the next number and a platen 50 mm smaller each way", async () => {
    const first = await newCabinet();
    const second = await newCabinet({ hingeSide: "RIGHT", otherVoltages: ["24VDC"] });

    expect([first.number, second.number]).toEqual([1, 2]);
    expect(second).toMatchObject({ hingeSide: "RIGHT", upFace: "TOP", otherVoltages: ["24VDC"] });
    expect((await detail(first.id)).platen).toMatchObject({ height: 5500, width: 3500 });
  });

  it("have unique numbers within the revision", async () => {
    await newCabinet({ number: 3 });

    const res = await call(designer, "POST", `${rev}/cabinets`, cabinetBody({ number: 3 }));

    expect(res.statusCode).toBe(409);
  });

  it("need room for the platen and integer sizes", async () => {
    const tooSmall = await call(designer, "POST", `${rev}/cabinets`, cabinetBody({ width: 500 }));
    const fractional = await call(
      designer,
      "POST",
      `${rev}/cabinets`,
      cabinetBody({ depth: 20.5 }),
    );

    expect(tooSmall.statusCode).toBe(400);
    expect(fractional.statusCode).toBe(400);
  });

  it("need an active cabinet type", async () => {
    await db.cabinetType.update({ where: { id: typeId }, data: { active: false } });

    const res = await call(designer, "POST", `${rev}/cabinets`, cabinetBody());

    expect(res.statusCode).toBe(400);
  });

  it("are listed on the revision with window and opening info", async () => {
    const c = await newCabinet();
    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });

    const res = await call(viewer, "GET", rev);

    const body = RevisionDetail.parse(res.json());
    expect(body.revision).toMatchObject({ rev: 1, status: "WORKING" });
    expect(body.workingRev).toBe(1);
    expect(body.cabinets).toEqual([
      expect.objectContaining({ number: 1, type: "Control", hasWindow: true, openingCount: 1 }),
    ]);
  });

  it("are edited, and turning the platen off keeps its size", async () => {
    const c = await newCabinet();
    await call(designer, "PUT", `${cabinetUrl(c.id)}/platen`, { height: 5000, width: 3000 });

    const res = await call(designer, "PATCH", cabinetUrl(c.id), {
      hasPlaten: false,
      mainVoltage: "230VAC",
    });

    expect(Cabinet.parse(res.json())).toMatchObject({ hasPlaten: false, mainVoltage: "230VAC" });
    expect((await detail(c.id)).platen).toMatchObject({ height: 5000, width: 3000 });
  });

  it("can't be written by a viewer", async () => {
    const c = await newCabinet();

    expect((await call(viewer, "POST", `${rev}/cabinets`, cabinetBody())).statusCode).toBe(403);
    expect((await call(viewer, "PATCH", cabinetUrl(c.id), { depth: 3000 })).statusCode).toBe(403);
  });

  it("are deleted with their platen and openings", async () => {
    const c = await newCabinet();
    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });

    expect((await call(designer, "DELETE", cabinetUrl(c.id))).statusCode).toBe(204);
    expect(await db.platen.count()).toBe(0);
    expect(await db.cabinetOpening.count()).toBe(0);
  });

  it("are only found through their own revision", async () => {
    const c = await newCabinet();
    const otherRev = rev.replace(/revisions\/1$/, "revisions/2");

    expect((await call(viewer, "GET", `${otherRev}/cabinets/${c.id}`)).statusCode).toBe(404);
  });
});

describe("the window switch", () => {
  it("adds a centred FRONT window at half the door size, once", async () => {
    const c = await newCabinet();

    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });
    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });

    const { openings } = await detail(c.id);
    expect(openings).toEqual([
      expect.objectContaining({
        kind: "WINDOW",
        face: "FRONT",
        // Top-left corner of a centred 200 × 300 mm window on the 400 × 600 mm door.
        x: 1000,
        y: 1500,
        width: 2000,
        height: 3000,
      }),
    ]);
  });

  it("removes every window when switched off, leaving holes", async () => {
    const c = await newCabinet();
    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });
    await call(designer, "POST", `${cabinetUrl(c.id)}/openings`, {
      kind: "ROUND_HOLE",
      face: "FRONT",
      x: 0,
      y: -2000,
      diameter: 225,
    });

    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: false });

    expect((await detail(c.id)).openings.map((o) => o.kind)).toEqual(["ROUND_HOLE"]);
  });
});

describe("openings", () => {
  const add = (cabinetId: number, body: object) =>
    call(designer, "POST", `${cabinetUrl(cabinetId)}/openings`, body);

  it("store only the size fields of their kind", async () => {
    const c = await newCabinet();
    const gland = await db.cableGland.create({ data: { size: "M20", holeDiameter: 205 } });

    const rect = await add(c.id, {
      kind: "RECT_HOLE",
      face: "LEFT",
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    const round = await add(c.id, {
      kind: "ROUND_HOLE",
      face: "TOP",
      x: 0,
      y: 0,
      diameter: 225,
      label: "S1",
    });
    const glandHole = await add(c.id, {
      kind: "CABLE_GLAND",
      face: "BOTTOM",
      x: -500,
      y: 0,
      glandId: gland.id,
    });

    expect(Opening.parse(rect.json())).toMatchObject({
      width: 300,
      height: 400,
      diameter: null,
      glandId: null,
    });
    expect(Opening.parse(round.json())).toMatchObject({ diameter: 225, width: null, label: "S1" });
    expect(Opening.parse(glandHole.json())).toMatchObject({
      glandId: gland.id,
      gland: { size: "M20", holeDiameter: 205 },
      diameter: null,
    });
  });

  it("clear old size fields when replaced with another kind", async () => {
    const c = await newCabinet();
    const created = Opening.parse(
      (
        await add(c.id, { kind: "RECT_HOLE", face: "FRONT", x: 0, y: 0, width: 300, height: 400 })
      ).json(),
    );

    const res = await call(designer, "PUT", `${cabinetUrl(c.id)}/openings/${created.id}`, {
      kind: "ROUND_HOLE",
      face: "BACK",
      x: 10,
      y: 20,
      diameter: 160,
    });

    expect(Opening.parse(res.json())).toMatchObject({
      kind: "ROUND_HOLE",
      face: "BACK",
      diameter: 160,
      width: null,
      height: null,
    });
  });

  it("are saved even when they stick out past the face (the UI warns)", async () => {
    const c = await newCabinet();

    const res = await add(c.id, {
      kind: "ROUND_HOLE",
      face: "LEFT",
      x: 1990,
      y: 1000,
      diameter: 300,
    });

    expect(res.statusCode).toBe(201);
  });

  it("refuse an unknown or inactive gland, but keep one deactivated later", async () => {
    const c = await newCabinet();
    const gland = await db.cableGland.create({ data: { size: "M25", holeDiameter: 255 } });
    const created = Opening.parse(
      (
        await add(c.id, { kind: "CABLE_GLAND", face: "BOTTOM", x: 0, y: 0, glandId: gland.id })
      ).json(),
    );
    await db.cableGland.update({ where: { id: gland.id }, data: { active: false } });

    const unknown = await add(c.id, {
      kind: "CABLE_GLAND",
      face: "BOTTOM",
      x: 0,
      y: 0,
      glandId: 9999,
    });
    const inactive = await add(c.id, {
      kind: "CABLE_GLAND",
      face: "BOTTOM",
      x: 0,
      y: 0,
      glandId: gland.id,
    });
    const moved = await call(designer, "PUT", `${cabinetUrl(c.id)}/openings/${created.id}`, {
      kind: "CABLE_GLAND",
      face: "BOTTOM",
      x: 300,
      y: 0,
      glandId: gland.id,
    });

    expect(unknown.statusCode).toBe(400);
    expect(inactive.statusCode).toBe(400);
    expect(moved.statusCode).toBe(200);
  });

  it("are deleted", async () => {
    const c = await newCabinet();
    const created = Opening.parse(
      (await add(c.id, { kind: "ROUND_HOLE", face: "FRONT", x: 0, y: 0, diameter: 225 })).json(),
    );

    const res = await call(designer, "DELETE", `${cabinetUrl(c.id)}/openings/${created.id}`);

    expect(res.statusCode).toBe(204);
    expect(await db.cabinetOpening.count()).toBe(0);
  });
});

describe("gland arrays", () => {
  const addArray = (cabinetId: number, body: object) =>
    call(designer, "POST", `${cabinetUrl(cabinetId)}/openings/gland-array`, body);

  async function setup() {
    const c = await newCabinet();
    const gland = await db.cableGland.create({ data: { size: "M20", holeDiameter: 205 } });
    return { c, gland };
  }

  it("create columns × rows gland openings from the first hole at x / y, numbering the label", async () => {
    const { c, gland } = await setup();

    const res = await addArray(c.id, {
      face: "BOTTOM",
      x: 300,
      y: 500,
      glandId: gland.id,
      columns: 3,
      rows: 2,
      pitchX: 300,
      pitchY: 400,
      label: "PG",
    });

    expect(res.statusCode).toBe(201);
    const created = Opening.array().parse(res.json());
    expect(created.map((o) => [o.label, o.x, o.y])).toEqual([
      ["PG1", 300, 500],
      ["PG2", 600, 500],
      ["PG3", 900, 500],
      ["PG4", 300, 900],
      ["PG5", 600, 900],
      ["PG6", 900, 900],
    ]);
    expect(created.every((o) => o.kind === "CABLE_GLAND" && o.glandId === gland.id)).toBe(true);
    expect((await detail(c.id)).openings).toHaveLength(6);
  });

  it("keep a single label as is and need no pitch for one hole", async () => {
    const { c, gland } = await setup();

    const res = await addArray(c.id, {
      face: "TOP",
      x: 0,
      y: 0,
      glandId: gland.id,
      columns: 1,
      rows: 1,
      pitchX: 0,
      pitchY: 0,
      label: "Main",
    });

    expect(
      Opening.array()
        .parse(res.json())
        .map((o) => o.label),
    ).toEqual(["Main"]);
  });

  it("are saved even when the holes overlap (the UI warns)", async () => {
    const { c, gland } = await setup();

    const res = await addArray(c.id, {
      face: "BOTTOM",
      x: 0,
      y: 0,
      glandId: gland.id,
      columns: 4,
      rows: 1,
      pitchX: 150,
      pitchY: 0,
    });

    expect(res.statusCode).toBe(201);
  });

  it("refuse a missing pitch, too many holes, or an inactive gland, creating nothing", async () => {
    const { c, gland } = await setup();
    const base = { face: "BOTTOM", x: 0, y: 0, glandId: gland.id, pitchX: 300, pitchY: 300 };

    const noPitch = await addArray(c.id, { ...base, columns: 2, rows: 1, pitchX: 0 });
    const tooMany = await addArray(c.id, { ...base, columns: 15, rows: 15 });
    await db.cableGland.update({ where: { id: gland.id }, data: { active: false } });
    const inactive = await addArray(c.id, { ...base, columns: 2, rows: 2 });

    expect([noPitch.statusCode, tooMany.statusCode, inactive.statusCode]).toEqual([400, 400, 400]);
    expect(await db.cabinetOpening.count()).toBe(0);
  });

  it("can't be added to a released revision", async () => {
    const { c, gland } = await setup();
    await releaseRevision();

    const res = await addArray(c.id, {
      face: "BOTTOM",
      x: 0,
      y: 0,
      glandId: gland.id,
      columns: 2,
      rows: 1,
      pitchX: 300,
      pitchY: 0,
    });

    expect(res.statusCode).toBe(409);
  });
});

describe("a released revision", () => {
  it("can be read but refuses every write", async () => {
    const c = await newCabinet();
    const hole = Opening.parse(
      (
        await call(designer, "POST", `${cabinetUrl(c.id)}/openings`, {
          kind: "ROUND_HOLE",
          face: "FRONT",
          x: 0,
          y: 0,
          diameter: 225,
        })
      ).json(),
    );
    await releaseRevision();

    const writes = await Promise.all([
      call(designer, "POST", `${rev}/cabinets`, cabinetBody()),
      call(designer, "PATCH", cabinetUrl(c.id), { depth: 3000 }),
      call(designer, "DELETE", cabinetUrl(c.id)),
      call(designer, "PUT", `${cabinetUrl(c.id)}/platen`, { height: 100, width: 100 }),
      call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true }),
      call(designer, "POST", `${cabinetUrl(c.id)}/openings`, {
        kind: "ROUND_HOLE",
        face: "FRONT",
        x: 0,
        y: 0,
        diameter: 100,
      }),
      call(designer, "PUT", `${cabinetUrl(c.id)}/openings/${hole.id}`, {
        kind: "ROUND_HOLE",
        face: "FRONT",
        x: 5,
        y: 0,
        diameter: 225,
      }),
      call(designer, "DELETE", `${cabinetUrl(c.id)}/openings/${hole.id}`),
    ]);

    for (const res of writes) {
      expect(res.statusCode).toBe(409);
      expect(ApiErrorBody.parse(res.json()).message).toMatch(/Rev 001 is released/);
    }
    expect((await call(viewer, "GET", cabinetUrl(c.id))).statusCode).toBe(200);
    expect(Platen.parse((await detail(c.id)).platen)).toMatchObject({ height: 5500 });
  });
});
