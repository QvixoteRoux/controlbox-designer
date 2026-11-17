import { CableGland, CableGlandList } from "@cabinet-planner/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUser, buildTestApp, db, login, resetDb } from "../../test/helpers.js";

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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });

async function addGland(size = "M20", holeDiameter = 205) {
  const res = await call(catalog, "POST", "/api/cable-glands", { size, holeDiameter });
  expect(res.statusCode).toBe(201);
  return CableGland.parse(res.json());
}

/** Puts the gland in a cabinet opening, so it counts as used. */
async function useGland(glandId: number) {
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
    data: { cabinetId: cabinet.id, kind: "CABLE_GLAND", face: "BOTTOM", x: 0, y: 0, glandId },
  });
}

describe("cable glands", () => {
  it("are managed with the Components permission and listed for everyone", async () => {
    await addGland("M25", 255);
    await addGland("M20", 205);

    const res = await call(viewer, "GET", "/api/cable-glands");

    expect(CableGlandList.parse(res.json())).toEqual([
      expect.objectContaining({ size: "M20", holeDiameter: 205, active: true, inUse: false }),
      expect.objectContaining({ size: "M25", holeDiameter: 255 }),
    ]);
  });

  it("can't be changed without the Components permission", async () => {
    const g = await addGland();

    const create = await call(projectsOnly, "POST", "/api/cable-glands", {
      size: "M32",
      holeDiameter: 325,
    });
    const edit = await call(viewer, "PATCH", `/api/cable-glands/${g.id}`, { holeDiameter: 210 });

    expect(create.statusCode).toBe(403);
    expect(edit.statusCode).toBe(403);
  });

  it("have unique sizes", async () => {
    await addGland("M20");

    const res = await call(catalog, "POST", "/api/cable-glands", {
      size: "M20",
      holeDiameter: 200,
    });

    expect(res.statusCode).toBe(409);
  });

  it("are edited and deactivated", async () => {
    const g = await addGland();

    const res = await call(catalog, "PATCH", `/api/cable-glands/${g.id}`, {
      holeDiameter: 210,
      active: false,
    });

    expect(CableGland.parse(res.json())).toMatchObject({ holeDiameter: 210, active: false });
  });

  it("are deleted only while unused", async () => {
    const unused = await addGland("M16", 165);
    const used = await addGland("M20", 205);
    await useGland(used.id);

    const deleteUnused = await call(catalog, "DELETE", `/api/cable-glands/${unused.id}`);
    const deleteUsed = await call(catalog, "DELETE", `/api/cable-glands/${used.id}`);

    expect(deleteUnused.statusCode).toBe(204);
    expect(deleteUsed.statusCode).toBe(409);
    const list = CableGlandList.parse((await call(viewer, "GET", "/api/cable-glands")).json());
    expect(list).toEqual([expect.objectContaining({ size: "M20", inUse: true })]);
  });
});
