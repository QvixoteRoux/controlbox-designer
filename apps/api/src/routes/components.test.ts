import {
  ApiErrorBody,
  BUILT_IN_RAIL,
  ComponentList,
  ComponentListItem,
  DEFAULT_STOCK_LENGTH,
  RAIL_WIDTH,
} from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, builtInRail, db, login, resetDb } from "../../test/helpers.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());

type Cookies = Record<string, string>;
let catalog: Cookies;
let projectsOnly: Cookies;
let viewer: Cookies;

beforeEach(async () => {
  await resetDb();
  await addUser("catalog", { role: "DESIGNER", canProjects: false, canComponents: true });
  await addUser("projects-only", { role: "DESIGNER", canProjects: true, canComponents: false });
  await addUser("viewer");
  catalog = await login(app, "catalog");
  projectsOnly = await login(app, "projects-only");
  viewer = await login(app, "viewer");
});

const call = (
  cookies: Cookies,
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });

const identity = (partNumber: string) => ({ manufacturer: "Acme", partNumber });
const contactor = (extra: object = {}) => ({
  kind: "STANDARD",
  ...identity("K-9"),
  height: 900,
  width: 450,
  depth: 800,
  railMount: true,
  railEdgeOffset: 200,
  inputVoltage: "24VDC",
  ...extra,
});

async function add(body: object) {
  const res = await call(catalog, "POST", "/api/components", body);
  expect(res.statusCode, res.body).toBe(201);
  return ComponentListItem.parse(res.json());
}

describe("the component catalog", () => {
  it("creates a gutter from its width only", async () => {
    const gutter = await add({ kind: "GUTTER", ...identity("WD-60"), width: 600 });
    expect(gutter).toMatchObject({ width: 600, height: 0, depth: 0 });
  });

  it("creates terminal blocks (1–4 levels) and ground terminals, always rail mounted", async () => {
    const box = { height: 600, width: 52, depth: 450, railEdgeOffset: 150 };
    const terminal = await add({
      kind: "TERMINAL_BLOCK",
      ...identity("TB-2"),
      ...box,
      attributes: { levels: 4 },
    });
    const ground = await add({ kind: "GROUND_TERMINAL", ...identity("PE-1"), ...box });

    expect(terminal).toMatchObject({ railMount: true, snappable: true, attributes: { levels: 4 } });
    expect(ground).toMatchObject({ railMount: true, attributes: {} });

    const fiveLevels = await call(catalog, "POST", "/api/components", {
      kind: "TERMINAL_BLOCK",
      ...identity("TB-5"),
      ...box,
      attributes: { levels: 5 },
    });
    expect(fiveLevels.statusCode).toBe(400);
  });

  it("lists every component with its type and whether it's in use", async () => {
    const type = await db.componentType.create({ data: { name: "Contactor" } });
    await add(contactor({ typeId: type.id }));

    const res = await call(viewer, "GET", "/api/components");

    expect(res.statusCode).toBe(200);
    expect(ComponentList.parse(res.json())).toEqual([
      expect.objectContaining({ partNumber: "K-9", type: "Contactor", inUse: false }),
      expect.objectContaining({ kind: "RAIL", partNumber: BUILT_IN_RAIL.partNumber }),
    ]);
  });

  it("refuses a duplicate part number or code with a clear 409", async () => {
    await add(contactor({ code: "C-1" }));

    const samePart = await call(catalog, "POST", "/api/components", contactor());
    const sameCode = await call(
      catalog,
      "POST",
      "/api/components",
      contactor({ partNumber: "K-10", code: "C-1" }),
    );

    expect(samePart.statusCode).toBe(409);
    expect(ApiErrorBody.parse(samePart.json()).message).toMatch(/already in the catalog/);
    expect(sameCode.statusCode).toBe(409);
    expect(ApiErrorBody.parse(sameCode.json()).message).toMatch(/Code C-1/);
  });

  it("refuses an inactive component type for new choices only", async () => {
    const type = await db.componentType.create({ data: { name: "Old", active: false } });

    const res = await call(catalog, "POST", "/api/components", contactor({ typeId: type.id }));

    expect(res.statusCode).toBe(400);
  });

  it("updates a component, keeping its image", async () => {
    const c = await add(contactor());
    await db.component.update({ where: { id: c.id }, data: { imagePath: "components/x.png" } });

    const res = await call(catalog, "PUT", `/api/components/${c.id}`, contactor({ width: 540 }));

    expect(res.statusCode).toBe(200);
    expect(ComponentListItem.parse(res.json())).toMatchObject({
      width: 540,
      imagePath: "components/x.png",
    });
  });

  it("needs the Components permission to write", async () => {
    const c = await add(contactor());

    for (const cookies of [viewer, projectsOnly]) {
      expect((await call(cookies, "POST", "/api/components", contactor())).statusCode).toBe(403);
      expect((await call(cookies, "DELETE", `/api/components/${c.id}`)).statusCode).toBe(403);
    }
  });
});

describe("the built-in DIN rail", () => {
  it("is in the catalog: TS35 × 7.5, 35 mm wide, 2000 mm stock", async () => {
    expect(await builtInRail()).toMatchObject({
      manufacturer: BUILT_IN_RAIL.manufacturer,
      partNumber: BUILT_IN_RAIL.partNumber,
      width: RAIL_WIDTH,
      height: 0,
      depth: 75,
      active: true,
      attributes: { stockLength: DEFAULT_STOCK_LENGTH },
    });
  });

  it("can't be added again, and no part can become a rail", async () => {
    const again = await call(catalog, "POST", "/api/components", { kind: "RAIL" });
    expect(again.statusCode).toBe(409);
    expect(ApiErrorBody.parse(again.json()).message).toMatch(/built in/);

    const k = await add(contactor());
    const toRail = await call(catalog, "PUT", `/api/components/${k.id}`, { kind: "RAIL" });
    expect(toRail.statusCode).toBe(409);
  });

  it("keeps its kind, sizes and active flag; only type, code and description change", async () => {
    const rail = await builtInRail();
    const url = `/api/components/${rail.id}`;

    const res = await call(catalog, "PUT", url, {
      kind: "RAIL",
      code: "DIN-35",
      description: "Slotted rail",
      depth: 150,
      active: false,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(ComponentListItem.parse(res.json())).toMatchObject({
      code: "DIN-35",
      description: "Slotted rail",
      depth: 75,
      active: true,
    });

    const toGutter = await call(catalog, "PUT", url, {
      kind: "GUTTER",
      ...identity("G"),
      width: 600,
    });
    expect(toGutter.statusCode).toBe(409);
  });

  it("can't be deleted", async () => {
    const rail = await builtInRail();
    const res = await call(catalog, "DELETE", `/api/components/${rail.id}`);
    expect(res.statusCode).toBe(409);
    expect(await db.component.count({ where: { kind: "RAIL" } })).toBe(1);
  });

  it("is the only rail the database accepts", async () => {
    await expect(
      db.component.create({
        data: {
          kind: "RAIL",
          manufacturer: "Acme",
          partNumber: "R2",
          height: 0,
          width: 350,
          depth: 75,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("components in use", () => {
  /** Mounts the component in a round hole on a cabinet face. */
  async function mount(componentId: number) {
    const user = await db.user.findFirstOrThrow();
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
    await db.cabinetOpening.create({
      data: {
        cabinetId: cabinet.id,
        kind: "ROUND_HOLE",
        face: "FRONT",
        x: 500,
        y: 500,
        diameter: 225,
        componentId,
      },
    });
  }

  it("can't be deleted, only deactivated", async () => {
    const c = await add(contactor());
    await mount(c.id);

    const del = await call(catalog, "DELETE", `/api/components/${c.id}`);
    const deactivate = await call(
      catalog,
      "PUT",
      `/api/components/${c.id}`,
      contactor({ active: false }),
    );

    expect(del.statusCode).toBe(409);
    expect(ApiErrorBody.parse(del.json()).message).toMatch(/Deactivate it instead/);
    expect(deactivate.statusCode).toBe(200);
    expect(ComponentListItem.parse(deactivate.json())).toMatchObject({
      active: false,
      inUse: true,
    });
  });

  it("keep their kind", async () => {
    const c = await add(contactor());
    await mount(c.id);

    const res = await call(catalog, "PUT", `/api/components/${c.id}`, {
      ...contactor(),
      kind: "FUSE",
      attributes: { amperage: 10, poles: 1 },
    });

    expect(res.statusCode).toBe(409);
  });

  it("unused ones are deleted", async () => {
    const c = await add(contactor());
    expect((await call(catalog, "DELETE", `/api/components/${c.id}`)).statusCode).toBe(204);
    expect((await call(viewer, "GET", `/api/components/${c.id}`)).statusCode).toBe(404);
  });
});

describe("component images", () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("rest of a png"),
  ]);
  const upload = (cookies: Cookies, id: number, body: Buffer, contentType = "image/png") =>
    app.inject({
      method: "PUT",
      url: `/api/components/${id}/image`,
      cookies,
      headers: { "content-type": contentType },
      payload: body,
    });

  it("stores an uploaded image as a file and serves it to signed-in users", async () => {
    const c = await add(contactor());

    const res = await upload(catalog, c.id, PNG);

    expect(res.statusCode, res.body).toBe(200);
    const { imagePath } = ComponentListItem.parse(res.json());
    expect(imagePath).toMatch(new RegExp(`^components/${c.id}-[0-9a-f-]{36}\\.png$`));

    const image = await call(viewer, "GET", `/api/images/${imagePath}`);
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.rawPayload.equals(PNG)).toBe(true);

    const anonymous = await app.inject({ method: "GET", url: `/api/images/${imagePath}` });
    expect(anonymous.statusCode).toBe(401);
  });

  it("checks the real file type, not the header", async () => {
    const c = await add(contactor());

    const fake = await upload(catalog, c.id, Buffer.from("<svg onload=alert(1)>"));
    const svg = await upload(catalog, c.id, Buffer.from("<svg/>"), "image/svg+xml");

    expect(fake.statusCode).toBe(400);
    expect(svg.statusCode).toBe(415);
  });

  it("removes the image from the component", async () => {
    const c = await add(contactor());
    await upload(catalog, c.id, PNG);

    const res = await call(catalog, "DELETE", `/api/components/${c.id}/image`);

    expect(ComponentListItem.parse(res.json()).imagePath).toBeNull();
  });

  it("refuses uploads without the Components permission and for unknown components", async () => {
    const c = await add(contactor());
    expect((await upload(projectsOnly, c.id, PNG)).statusCode).toBe(403);
    expect((await upload(catalog, 9999, PNG)).statusCode).toBe(404);
  });

  it("doesn't serve paths outside the image folders", async () => {
    const res = await call(viewer, "GET", "/api/images/../../.env");
    expect(res.statusCode).toBe(404);
  });
});
