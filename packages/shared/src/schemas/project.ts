import { z } from "zod";
import { MAX_REV } from "../revisions.js";
import { Extra, Id, Timestamp } from "./common.js";
import { RevisionStatus } from "./enums.js";

// ── Projects ──

export const Project = z.object({
  id: Id,
  name: z.string(),
  customer: z.string(),
  extra: Extra,
  createdById: Id,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Project = z.infer<typeof Project>;

export const CreateProjectInput = z.object({
  name: z.string().trim().min(1).max(200),
  customer: z.string().trim().min(1).max(200),
  extra: Extra.default({}),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

// ── Machines (one design within a project, built `quantity` times) ──

export const Quantity = z.number().int().min(1);

export const Machine = z.object({
  id: Id,
  projectId: Id,
  name: z.string(),
  quantity: Quantity,
  extra: Extra,
  createdById: Id,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Machine = z.infer<typeof Machine>;

export const CreateMachineInput = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: Quantity.default(1),
  extra: Extra.default({}),
});
export type CreateMachineInput = z.infer<typeof CreateMachineInput>;

// ── Revisions (per machine, 0…999, shown with formatRev) ──

export const RevNumber = z.number().int().min(0).max(MAX_REV);

export const MachineRevision = z.object({
  id: Id,
  machineId: Id,
  rev: RevNumber,
  status: RevisionStatus,
  notes: z.string().nullable(),
  basedOnId: Id.nullable(),
  createdById: Id,
  createdAt: Timestamp,
  releasedById: Id.nullable(),
  releasedAt: Timestamp.nullable(),
});
export type MachineRevision = z.infer<typeof MachineRevision>;
