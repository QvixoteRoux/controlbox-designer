import {
  CreateMachineInput,
  CreateProjectInput,
  MachineParams,
  ProjectListQuery,
  ProjectParams,
  ReleaseRevisionInput,
  RevisionParams,
  UpdateMachineInput,
  UpdateProjectInput,
} from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { currentUser, requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  assertMachineInProject,
  createMachine,
  createProject,
  deleteMachine,
  deleteProject,
  getMachine,
  getProject,
  listCustomers,
  listProjects,
  updateMachine,
  updateProject,
} from "../services/projects.js";
import { createNextRevision, releaseRevision } from "../services/revisions.js";

export interface ProjectsRoutesOptions {
  db: PrismaClient;
}

/** Projects, their machines, and machine revisions. Reads: any user. Writes: `projects`. */
export const projectsRoutes: FastifyPluginCallback<ProjectsRoutesOptions> = (app, { db }, done) => {
  const read = { preHandler: requireAuth };
  const write = { preHandler: requirePermission("projects") };

  // ── Projects ──

  app.get("/projects", read, (request) =>
    listProjects(db, ProjectListQuery.parse(request.query).search),
  );

  app.get("/customers", read, () => listCustomers(db));

  app.post("/projects", write, async (request, reply) => {
    const input = CreateProjectInput.parse(request.body);
    const project = await createProject(db, input, currentUser(request).id);
    return reply.code(201).send(project);
  });

  app.get("/projects/:projectId", read, (request) =>
    getProject(db, ProjectParams.parse(request.params).projectId),
  );

  app.patch("/projects/:projectId", write, (request) => {
    const { projectId } = ProjectParams.parse(request.params);
    return updateProject(db, projectId, UpdateProjectInput.parse(request.body));
  });

  app.delete("/projects/:projectId", write, async (request, reply) => {
    const { projectId } = ProjectParams.parse(request.params);
    await deleteProject(db, projectId, currentUser(request));
    return reply.code(204).send();
  });

  // ── Machines ──

  app.post("/projects/:projectId/machines", write, async (request, reply) => {
    const { projectId } = ProjectParams.parse(request.params);
    const input = CreateMachineInput.parse(request.body);
    const machine = await createMachine(db, projectId, input, currentUser(request).id);
    return reply.code(201).send(machine);
  });

  app.get("/projects/:projectId/machines/:machineId", read, (request) => {
    const { projectId, machineId } = MachineParams.parse(request.params);
    return getMachine(db, projectId, machineId);
  });

  app.patch("/projects/:projectId/machines/:machineId", write, (request) => {
    const { projectId, machineId } = MachineParams.parse(request.params);
    return updateMachine(db, projectId, machineId, UpdateMachineInput.parse(request.body));
  });

  app.delete("/projects/:projectId/machines/:machineId", write, async (request, reply) => {
    const { projectId, machineId } = MachineParams.parse(request.params);
    await deleteMachine(db, projectId, machineId, currentUser(request));
    return reply.code(204).send();
  });

  // ── Revisions ──

  app.post("/projects/:projectId/machines/:machineId/revisions", write, async (request, reply) => {
    const { projectId, machineId } = MachineParams.parse(request.params);
    await assertMachineInProject(db, projectId, machineId);
    const revision = await createNextRevision(db, machineId, currentUser(request).id);
    return reply.code(201).send(revision);
  });

  app.post(
    "/projects/:projectId/machines/:machineId/revisions/:rev/release",
    write,
    async (request) => {
      const { projectId, machineId, rev } = RevisionParams.parse(request.params);
      const { notes } = ReleaseRevisionInput.parse(request.body);
      await assertMachineInProject(db, projectId, machineId);
      return releaseRevision(db, machineId, rev, currentUser(request).id, notes);
    },
  );

  done();
};
