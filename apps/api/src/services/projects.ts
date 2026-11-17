import {
  can,
  type CreateMachineInput,
  type CreateProjectInput,
  type UpdateMachineInput,
  type UpdateProjectInput,
} from "@cabinet-planner/shared";
import type { PublicUser } from "../auth/sessions.js";
import { HttpError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { createInitialRevision, revisionSummaryInclude } from "./revisions.js";

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const userRef = { select: { id: true, displayName: true } } as const;

/**
 * Deleting removes the whole revision history. Anyone with `projects` may delete while nothing
 * is released; once something is, only an admin may (guidelines/revisions.md).
 */
function assertMayDelete(user: PublicUser, hasReleased: boolean, what: string) {
  if (hasReleased && !can(user, "admin")) {
    throw new HttpError(403, `Only an admin can delete a ${what} that has released revisions`);
  }
}

// ── Projects ──

export async function listProjects(db: PrismaClient, search?: string) {
  const rows = await db.project.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { customer: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      customer: true,
      updatedAt: true,
      _count: { select: { machines: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(({ _count, ...p }) => ({ ...p, machineCount: _count.machines }));
}

export async function listCustomers(db: PrismaClient) {
  const rows = await db.project.findMany({
    distinct: ["customer"],
    select: { customer: true },
    orderBy: { customer: "asc" },
  });
  return rows.map((r) => r.customer);
}

const hasReleasedRevision = (db: PrismaClient, where: Prisma.MachineWhereInput) =>
  db.machineRevision.count({ where: { status: "RELEASED", machine: where } }).then((n) => n > 0);

export async function getProject(db: PrismaClient, projectId: number) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      createdBy: userRef,
      machines: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          quantity: true,
          revisions: { orderBy: { rev: "desc" }, take: 1, select: { rev: true, status: true } },
        },
      },
    },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const { machines, ...rest } = project;
  return {
    ...rest,
    machines: machines.map(({ revisions, ...m }) => {
      const latestRevision = revisions[0];
      // Every machine gets Rev 001 on creation, in the same transaction.
      if (!latestRevision) throw new Error(`Machine ${m.id} has no revisions`);
      return { ...m, latestRevision };
    }),
    hasReleased: await hasReleasedRevision(db, { projectId }),
  };
}

export async function createProject(db: PrismaClient, input: CreateProjectInput, userId: number) {
  try {
    return await db.project.create({ data: { ...input, createdById: userId } });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, `A project named "${input.name}" exists`);
    throw err;
  }
}

export async function updateProject(
  db: PrismaClient,
  projectId: number,
  patch: UpdateProjectInput,
) {
  await getProjectOr404(db, projectId);
  try {
    return await db.project.update({ where: { id: projectId }, data: patch });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, `A project named "${patch.name}" exists`);
    throw err;
  }
}

export async function deleteProject(db: PrismaClient, projectId: number, user: PublicUser) {
  await getProjectOr404(db, projectId);
  assertMayDelete(user, await hasReleasedRevision(db, { projectId }), "project");
  await db.project.delete({ where: { id: projectId } });
}

async function getProjectOr404(db: PrismaClient, projectId: number) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new HttpError(404, "Project not found");
}

// ── Machines ──

/** 404 unless the machine exists and belongs to the project in the URL. */
export async function assertMachineInProject(
  db: PrismaClient,
  projectId: number,
  machineId: number,
) {
  const machine = await db.machine.findUnique({
    where: { id: machineId },
    select: { projectId: true },
  });
  if (machine?.projectId !== projectId) throw new HttpError(404, "Machine not found");
}

export async function getMachine(db: PrismaClient, projectId: number, machineId: number) {
  await assertMachineInProject(db, projectId, machineId);
  return db.machine.findUniqueOrThrow({
    where: { id: machineId },
    include: {
      project: { select: { id: true, name: true, customer: true } },
      createdBy: userRef,
      revisions: { orderBy: { rev: "desc" }, include: revisionSummaryInclude },
    },
  });
}

/** Creates the machine and its Rev 001 (WORKING) together. */
export async function createMachine(
  db: PrismaClient,
  projectId: number,
  input: CreateMachineInput,
  userId: number,
) {
  await getProjectOr404(db, projectId);
  try {
    return await db.$transaction(async (tx) => {
      const machine = await tx.machine.create({
        data: { ...input, projectId, createdById: userId },
      });
      await createInitialRevision(tx, machine.id, userId);
      await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
      return machine;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, `This project already has a machine named "${input.name}"`);
    }
    throw err;
  }
}

export async function updateMachine(
  db: PrismaClient,
  projectId: number,
  machineId: number,
  patch: UpdateMachineInput,
) {
  await assertMachineInProject(db, projectId, machineId);
  try {
    return await db.machine.update({ where: { id: machineId }, data: patch });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, `This project already has a machine named "${patch.name}"`);
    }
    throw err;
  }
}

export async function deleteMachine(
  db: PrismaClient,
  projectId: number,
  machineId: number,
  user: PublicUser,
) {
  await assertMachineInProject(db, projectId, machineId);
  assertMayDelete(user, await hasReleasedRevision(db, { id: machineId }), "machine");
  await db.machine.delete({ where: { id: machineId } });
}
