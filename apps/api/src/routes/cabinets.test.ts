import {
  ApiErrorBody,
  Cabinet,
  CabinetDetail,
  Opening,
  Platen,
  RevisionDetail,
} from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, builtInRail, db, login, resetDb } from "../../test/helpers.js";

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

describe("doors", () => {
  it("default to one door, hinged on the left", async () => {
    expect(await newCabinet()).toMatchObject({ doors: 1, hingeSide: "LEFT", upFace: "TOP" });
  });

  it("two doors are hinged left and right and mounted as manufactured", async () => {
    const c = await newCabinet({ doors: 2 });
    expect(c).toMatchObject({ doors: 2, hingeSide: "BOTH", upFace: "TOP" });

    const hinged = await call(
      designer,
      "POST",
      `${rev}/cabinets`,
      cabinetBody({ doors: 2, hingeSide: "LEFT" }),
    );
    const rotated = await call(
      designer,
      "POST",
      `${rev}/cabinets`,
      cabinetBody({ doors: 2, upFace: "FRONT" }),
    );
    const single = await call(
      designer,
      "POST",
      `${rev}/cabinets`,
      cabinetBody({ hingeSide: "BOTH" }),
    );
    for (const res of [hinged, rotated, single]) expect(res.statusCode).toBe(400);
  });

  it("switching doors brings the hinges and mounting along", async () => {
    const c = await newCabinet({ hingeSide: "RIGHT", upFace: "LEFT" });
    const url = cabinetUrl(c.id);

    const two = await call(designer, "PATCH", url, { doors: 2 });
    expect(Cabinet.parse(two.json())).toMatchObject({ doors: 2, hingeSide: "BOTH", upFace: "TOP" });
    expect((await call(designer, "PATCH", url, { upFace: "BOTTOM" })).statusCode).toBe(400);
    expect((await call(designer, "PATCH", url, { hingeSide: "LEFT" })).statusCode).toBe(400);

    const one = await call(designer, "PATCH", url, { doors: 1 });
    expect(Cabinet.parse(one.json())).toMatchObject({ doors: 1, hingeSide: "LEFT", upFace: "TOP" });
  });

  it("get one window per door, and the database keeps the rule", async () => {
    const c = await newCabinet({ doors: 2 });
    await call(designer, "PUT", `${cabinetUrl(c.id)}/window`, { hasWindow: true });
    const windows = (await detail(c.id)).openings.filter((o) => o.kind === "WINDOW");
    // 400 mm wide: two 200 mm doors, each with a centred 100 × 300 mm window.
    expect(windows.map((w) => [w.x, w.y, w.width, w.height])).toEqual([
      [500, 1500, 1000, 3000],
      [2500, 1500, 1000, 3000],
    ]);

    await expect(
      db.cabinet.update({ where: { id: c.id }, data: { upFace: "LEFT" } }),
    ).rejects.toThrow();
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

describe("the bottom plate switch", () => {
  const plateUrl = (id: number) => `${cabinetUrl(id)}/bottom-plate`;

  it("adds a centred plate at 70 % of the bottom face with 10 mm corners, once", async () => {
    const c = await newCabinet();

    expect((await call(designer, "PUT", plateUrl(c.id), { hasBottomPlate: true })).statusCode).toBe(
      204,
    );
    await call(designer, "PUT", plateUrl(c.id), { hasBottomPlate: true });

    expect((await detail(c.id)).openings).toEqual([
      expect.objectContaining({
        kind: "BOTTOM_PLATE",
        face: "BOTTOM",
        // 280 × 140 mm on the 400 × 200 mm bottom, top-left corner 60 / 30 mm in.
        x: 600,
        y: 300,
        width: 2800,
        height: 1400,
        cornerRadius: 100,
        diameter: null,
      }),
    ]);
  });

  it("removes the plate when switched off, leaving holes", async () => {
    const c = await newCabinet();
    await call(designer, "PUT", plateUrl(c.id), { hasBottomPlate: true });
    await call(designer, "POST", `${cabinetUrl(c.id)}/openings`, {
      kind: "ROUND_HOLE",
      face: "BOTTOM",
      x: 2000,
      y: 1000,
      diameter: 205,
    });

    await call(designer, "PUT", plateUrl(c.id), { hasBottomPlate: false });

    expect((await detail(c.id)).openings.map((o) => o.kind)).toEqual(["ROUND_HOLE"]);
  });

  it("needs the projects permission", async () => {
    const c = await newCabinet();
    expect((await call(viewer, "PUT", plateUrl(c.id), { hasBottomPlate: true })).statusCode).toBe(
      403,
    );
    expect(await db.cabinetOpening.count()).toBe(0);
  });

  it("can be edited, but only on BOTTOM and with corners that fit", async () => {
    const c = await newCabinet();
    const plate = {
      kind: "BOTTOM_PLATE",
      face: "BOTTOM",
      x: 500,
      y: 400,
      width: 2000,
      height: 1000,
      cornerRadius: 0,
    };
    const res = await call(designer, "POST", `${cabinetUrl(c.id)}/openings`, plate);
    expect(res.statusCode).toBe(201);
    expect(Opening.parse(res.json())).toMatchObject({ cornerRadius: 0, diameter: null });

    const bad = [
      { ...plate, face: "FRONT" },
      { ...plate, cornerRadius: 501 },
      { ...plate, cornerRadius: -1 },
    ];
    for (const body of bad) {
      expect((await call(designer, "POST", `${cabinetUrl(c.id)}/openings`, body)).statusCode).toBe(
        400,
      );
    }
    // Switching another kind's opening to a plate and back clears the radius.
    const id = Opening.parse(res.json()).id;
    const hole = { kind: "RECT_HOLE", face: "BOTTOM", x: 0, y: 0, width: 100, height: 100 };
    const back = await call(designer, "PUT", `${cabinetUrl(c.id)}/openings/${id}`, hole);
    expect(Opening.parse(back.json()).cornerRadius).toBeNull();
  });

  it("is backed by the database check", async () => {
    const c = await newCabinet();
    const row = {
      cabinetId: c.id,
      kind: "BOTTOM_PLATE" as const,
      face: "BOTTOM" as const,
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      cornerRadius: 100,
    };
    await expect(db.cabinetOpening.create({ data: { ...row, face: "TOP" } })).rejects.toThrow();
    await expect(
      db.cabinetOpening.create({ data: { ...row, cornerRadius: 301 } }),
    ).rejects.toThrow();
    await expect(
      db.cabinetOpening.create({ data: { ...row, kind: "WINDOW", cornerRadius: 10 } }),
    ).rejects.toThrow();
    await expect(db.cabinetOpening.create({ data: row })).resolves.toBeTruthy();
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
      call(designer, "PUT", `${cabinetUrl(c.id)}/bottom-plate`, { hasBottomPlate: true }),
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

describe("a component mounted in a round hole", () => {
  const add = (cabinetId: number, body: object) =>
    call(designer, "POST", `${cabinetUrl(cabinetId)}/openings`, body);
  const hole = (componentId: number | null) => ({
    kind: "ROUND_HOLE",
    face: "FRONT",
    x: 500,
    y: 500,
    diameter: 225,
    componentId,
  });
  const part = (partNumber: string, extra: object = {}) =>
    db.component.create({
      data: { manufacturer: "Acme", partNumber, height: 300, width: 300, depth: 400, ...extra },
    });

  it("is saved and shown on the opening", async () => {
    const c = await newCabinet();
    const button = await part("PB-1");

    const res = await add(c.id, hole(button.id));

    expect(res.statusCode, res.body).toBe(201);
    expect(Opening.parse(res.json()).component).toMatchObject({
      id: button.id,
      partNumber: "PB-1",
    });
  });

  it("must be active and fit in a hole", async () => {
    const c = await newCabinet();
    const old = await part("PB-OLD", { active: false });
    const rail = await builtInRail();

    expect((await add(c.id, hole(old.id))).statusCode).toBe(400);
    expect((await add(c.id, hole(rail.id))).statusCode).toBe(400);
  });

  it("stays when deactivated later, and goes when the hole changes kind", async () => {
    const c = await newCabinet();
    const button = await part("PB-1");
    const opening = Opening.parse((await add(c.id, hole(button.id))).json());
    await db.component.update({ where: { id: button.id }, data: { active: false } });
    const url = `${cabinetUrl(c.id)}/openings/${opening.id}`;

    const kept = await call(designer, "PUT", url, { ...hole(button.id), diameter: 300 });
    expect(Opening.parse(kept.json()).componentId).toBe(button.id);

    const rect = await call(designer, "PUT", url, {
      kind: "RECT_HOLE",
      face: "FRONT",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(Opening.parse(rect.json()).componentId).toBeNull();
  });
});
