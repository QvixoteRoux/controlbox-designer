import {
  ApiErrorBody,
  CustomerList,
  Machine,
  MachineDetail,
  Project,
  ProjectDetail,
  ProjectList,
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
let admin: Cookies;

beforeEach(async () => {
  await resetDb();
  await addUser("designer", { role: "DESIGNER" });
  await addUser("viewer", { role: "VIEWER" });
  await addUser("admin", { role: "ADMIN" });
  designer = await login(app, "designer");
  viewer = await login(app, "viewer");
  admin = await login(app, "admin");
});

const send = (
  cookies: Cookies,
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, cookies, ...(payload && { payload }) });
const get = (cookies: Cookies, url: string) => app.inject({ method: "GET", url, cookies });

async function newProject(name = "Line 4 retrofit", customer = "Acme Foods") {
  const res = await send(designer, "POST", "/api/projects", { name, customer });
  expect(res.statusCode).toBe(201);
  return Project.parse(res.json());
}

async function newMachine(projectId: number, name = "Filler", quantity = 1) {
  const res = await send(designer, "POST", `/api/projects/${projectId}/machines`, {
    name,
    quantity,
  });
  expect(res.statusCode).toBe(201);
  return Machine.parse(res.json());
}

const machineUrl = (m: { projectId: number; id: number }) =>
  `/api/projects/${m.projectId}/machines/${m.id}`;

async function release(m: { projectId: number; id: number }, rev: number, cookies = designer) {
  return send(cookies, "POST", `${machineUrl(m)}/revisions/${rev}/release`, {
    notes: "First issue",
  });
}

describe("projects", () => {
  it("are created by designers and listed for everyone", async () => {
    const p = await newProject();
    await newMachine(p.id);

    const res = await get(viewer, "/api/projects");

    expect(res.statusCode).toBe(200);
    expect(ProjectList.parse(res.json())).toEqual([
      expect.objectContaining({ name: "Line 4 retrofit", customer: "Acme Foods", machineCount: 1 }),
    ]);
  });

  it("can't be created or edited by a viewer", async () => {
    const p = await newProject();

    expect(
      (await send(viewer, "POST", "/api/projects", { name: "X", customer: "Y" })).statusCode,
    ).toBe(403);
    expect((await send(viewer, "PATCH", `/api/projects/${p.id}`, { name: "Z" })).statusCode).toBe(
      403,
    );
  });

  it("can't be created by a designer without the Projects permission", async () => {
    await addUser("catalog-only", { role: "DESIGNER", canProjects: false });
    const cookies = await login(app, "catalog-only");

    const res = await send(cookies, "POST", "/api/projects", { name: "X", customer: "Y" });

    expect(res.statusCode).toBe(403);
  });

  it("are searched by name or customer, ignoring case", async () => {
    await newProject("Line 4 retrofit", "Acme Foods");
    await newProject("Palletiser", "Bolt Drinks");

    const byName = ProjectList.parse((await get(viewer, "/api/projects?search=PALLET")).json());
    const byCustomer = ProjectList.parse((await get(viewer, "/api/projects?search=acme")).json());

    expect(byName.map((p) => p.name)).toEqual(["Palletiser"]);
    expect(byCustomer.map((p) => p.name)).toEqual(["Line 4 retrofit"]);
  });

  it("have unique names", async () => {
    await newProject("Line 4");

    const res = await send(designer, "POST", "/api/projects", {
      name: "Line 4",
      customer: "Other",
    });

    expect(res.statusCode).toBe(409);
  });

  it("list the customers already used, once each", async () => {
    await newProject("A", "Bolt Drinks");
    await newProject("B", "Acme Foods");
    await newProject("C", "Acme Foods");

    const res = await get(viewer, "/api/customers");

    expect(CustomerList.parse(res.json())).toEqual(["Acme Foods", "Bolt Drinks"]);
  });

  it("show their machines with the latest revision", async () => {
    const p = await newProject();
    const m = await newMachine(p.id, "Filler", 3);
    await release({ projectId: p.id, id: m.id }, 1);
    await send(designer, "POST", `${machineUrl({ projectId: p.id, id: m.id })}/revisions`);

    const detail = ProjectDetail.parse((await get(viewer, `/api/projects/${p.id}`)).json());

    expect(detail.machines).toEqual([
      expect.objectContaining({
        name: "Filler",
        quantity: 3,
        latestRevision: { rev: 2, status: "WORKING" },
      }),
    ]);
    expect(detail.hasReleased).toBe(true);
  });

  it("are edited", async () => {
    const p = await newProject();

    const res = await send(designer, "PATCH", `/api/projects/${p.id}`, { customer: "New Owner" });

    expect(Project.parse(res.json()).customer).toBe("New Owner");
  });
});

describe("machines", () => {
  it("start with Rev 001 (WORKING)", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    const detail = MachineDetail.parse((await get(viewer, machineUrl(m))).json());

    expect(detail.revisions).toEqual([
      expect.objectContaining({ rev: 1, status: "WORKING", releasedBy: null }),
    ]);
    expect(detail.project.name).toBe(p.name);
  });

  it("have unique names within a project", async () => {
    const p = await newProject();
    await newMachine(p.id, "Filler");
    const other = await newProject("Other project");

    const dup = await send(designer, "POST", `/api/projects/${p.id}/machines`, { name: "Filler" });
    const elsewhere = await send(designer, "POST", `/api/projects/${other.id}/machines`, {
      name: "Filler",
    });

    expect(dup.statusCode).toBe(409);
    expect(elsewhere.statusCode).toBe(201);
  });

  it("need a quantity of at least 1", async () => {
    const p = await newProject();

    const res = await send(designer, "POST", `/api/projects/${p.id}/machines`, {
      name: "X",
      quantity: 0,
    });

    expect(res.statusCode).toBe(400);
  });

  it("are only reachable through their own project", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);
    const other = await newProject("Other project");

    expect((await get(viewer, `/api/projects/${other.id}/machines/${m.id}`)).statusCode).toBe(404);
  });

  it("can change quantity after a release", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);
    await release(m, 1);

    const res = await send(designer, "PATCH", machineUrl(m), { quantity: 5 });

    expect(Machine.parse(res.json()).quantity).toBe(5);
  });
});

describe("revisions", () => {
  it("are released with a required note, by who and when", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    const noNote = await send(designer, "POST", `${machineUrl(m)}/revisions/1/release`, {
      notes: "  ",
    });
    const ok = await release(m, 1);

    expect(noNote.statusCode).toBe(400);
    expect(ok.statusCode).toBe(200);
    const detail = MachineDetail.parse((await get(viewer, machineUrl(m))).json());
    expect(detail.revisions[0]).toMatchObject({
      rev: 1,
      status: "RELEASED",
      notes: "First issue",
      releasedBy: { displayName: "designer" },
    });
    expect(detail.revisions[0]?.releasedAt).not.toBeNull();
  });

  it("can't be released twice or by a viewer", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    expect((await release(m, 1, viewer)).statusCode).toBe(403);
    expect((await release(m, 1)).statusCode).toBe(200);
    const again = await release(m, 1);
    expect(again.statusCode).toBe(409);
    expect(ApiErrorBody.parse(again.json()).message).toMatch(/already released/);
  });

  it("only get a new one when nothing is WORKING", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    const whileWorking = await send(designer, "POST", `${machineUrl(m)}/revisions`);
    await release(m, 1);
    const afterRelease = await send(designer, "POST", `${machineUrl(m)}/revisions`);

    expect(whileWorking.statusCode).toBe(409);
    expect(afterRelease.statusCode).toBe(201);
    expect(afterRelease.json()).toMatchObject({ rev: 2, status: "WORKING" });
  });

  it("return 404 for a revision that doesn't exist", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    expect((await release(m, 7)).statusCode).toBe(404);
  });

  it("are numbered from 1, so revision 0 is invalid input", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    expect((await release(m, 0)).statusCode).toBe(400);
  });

  it("let only one of two simultaneous 'new revision' requests through", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);
    await release(m, 1);

    const results = await Promise.all([
      send(designer, "POST", `${machineUrl(m)}/revisions`),
      send(admin, "POST", `${machineUrl(m)}/revisions`),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await db.machineRevision.count({ where: { machineId: m.id } })).toBe(2);
  });
});

describe("deleting", () => {
  it("lets a designer delete a machine or project with nothing released", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);

    expect((await send(designer, "DELETE", machineUrl(m))).statusCode).toBe(204);
    expect((await send(designer, "DELETE", `/api/projects/${p.id}`)).statusCode).toBe(204);
    expect(await db.project.count()).toBe(0);
  });

  it("keeps released history from designers", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);
    await release(m, 1);

    const machineRes = await send(designer, "DELETE", machineUrl(m));
    const projectRes = await send(designer, "DELETE", `/api/projects/${p.id}`);

    expect(machineRes.statusCode).toBe(403);
    expect(projectRes.statusCode).toBe(403);
    expect(ApiErrorBody.parse(projectRes.json()).message).toMatch(/Only an admin/);
  });

  it("lets an admin delete released history, all of it", async () => {
    const p = await newProject();
    const m = await newMachine(p.id);
    await release(m, 1);

    expect((await send(admin, "DELETE", `/api/projects/${p.id}`)).statusCode).toBe(204);
    expect(await db.machine.count()).toBe(0);
    expect(await db.machineRevision.count()).toBe(0);
  });

  it("is refused to a viewer", async () => {
    const p = await newProject();

    expect((await send(viewer, "DELETE", `/api/projects/${p.id}`)).statusCode).toBe(403);
  });
});
