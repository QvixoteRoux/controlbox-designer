import { ApiErrorBody, CatalogType, CatalogTypeList } from "@cabinet-planner/shared";
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

beforeEach(async () => {
  await resetDb();
  await addUser("catalog", { role: "DESIGNER", canProjects: false, canComponents: true });
  await addUser("projects-only", { role: "DESIGNER", canProjects: true, canComponents: false });
  catalog = await login(app, "catalog");
  projectsOnly = await login(app, "projects-only");
});

const call = (
  cookies: Cookies,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });

describe.each(["cabinet-types", "component-types"] as const)("/api/types/%s", (kind) => {
  const url = `/api/types/${kind}`;

  async function add(name: string, sortOrder?: number) {
    const res = await call(catalog, "POST", url, { name, sortOrder });
    expect(res.statusCode, res.body).toBe(201);
    return CatalogType.parse(res.json());
  }

  it("adds types at the end of the list unless a sort order is given", async () => {
    await add("B");
    await add("C");
    await add("A", 0);

    const list = CatalogTypeList.parse((await call(projectsOnly, "GET", url)).json());

    expect(list.map((t) => [t.name, t.sortOrder])).toEqual([
      ["A", 0],
      ["B", 0],
      ["C", 1],
    ]);
  });

  it("refuses a duplicate name", async () => {
    await add("Power");
    const res = await call(catalog, "POST", url, { name: "Power" });
    expect(res.statusCode).toBe(409);
  });

  it("renames and deactivates, and deletes unused types", async () => {
    const t = await add("Misc");

    const patched = await call(catalog, "PATCH", `${url}/${t.id}`, {
      name: "Other",
      active: false,
    });
    expect(CatalogType.parse(patched.json())).toMatchObject({ name: "Other", active: false });

    expect((await call(catalog, "DELETE", `${url}/${t.id}`)).statusCode).toBe(204);
  });

  it("keeps types in use: deactivate instead", async () => {
    const t = await add("Used");
    if (kind === "component-types") {
      await db.component.create({
        data: { typeId: t.id, manufacturer: "A", partNumber: "1", height: 1, width: 1, depth: 1 },
      });
    } else {
      const user = await db.user.findFirstOrThrow();
      const project = await db.project.create({
        data: { name: "P", customer: "C", createdById: user.id },
      });
      const machine = await db.machine.create({
        data: { projectId: project.id, name: "M", createdById: user.id },
      });
      const revision = await db.machineRevision.create({
        data: { machineId: machine.id, rev: 1, createdById: user.id },
      });
      await db.cabinet.create({
        data: {
          revisionId: revision.id,
          number: 1,
          typeId: t.id,
          material: "METAL",
          height: 6000,
          width: 4000,
          depth: 2000,
          mainVoltage: "400VAC",
        },
      });
    }

    const res = await call(catalog, "DELETE", `${url}/${t.id}`);

    expect(res.statusCode).toBe(409);
    expect(ApiErrorBody.parse(res.json()).message).toMatch(/Deactivate it instead/);
    expect(CatalogTypeList.parse((await call(catalog, "GET", url)).json())[0]?.inUse).toBe(true);
  });

  it("needs the Components permission to write", async () => {
    expect((await call(projectsOnly, "POST", url, { name: "X" })).statusCode).toBe(403);
  });
});

it("rejects an unknown type list", async () => {
  expect((await call(catalog, "GET", "/api/types/colours")).statusCode).toBe(400);
});
