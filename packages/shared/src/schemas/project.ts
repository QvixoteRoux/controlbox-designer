import { z } from "zod";
import { FIRST_REV, MAX_REV } from "../revisions.js";
import { Extra, Id, Timestamp } from "./common.js";
import { RevisionStatus } from "./enums.js";

/** A user as shown next to "created by" / "released by". */
export const UserRef = z.object({ id: Id, displayName: z.string() });
export type UserRef = z.infer<typeof UserRef>;

// ── Projects ──

const ProjectName = z.string().trim().min(1, "Required").max(200);
const CustomerName = z.string().trim().min(1, "Required").max(200);

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
  name: ProjectName,
  customer: CustomerName,
  extra: Extra.default({}),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z
  .strictObject({ name: ProjectName, customer: CustomerName, extra: Extra })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

/** GET /api/projects?search= : matches name or customer, ignoring case. */
export const ProjectListQuery = z.object({ search: z.string().trim().optional() });
export type ProjectListQuery = z.infer<typeof ProjectListQuery>;

/** A row of GET /api/projects. */
export const ProjectSummary = Project.pick({
  id: true,
  name: true,
  customer: true,
  updatedAt: true,
}).extend({ machineCount: z.number().int().nonnegative() });
export type ProjectSummary = z.infer<typeof ProjectSummary>;
export const ProjectList = z.array(ProjectSummary);

/** GET /api/customers: customer names already in use, for suggestions. */
export const CustomerList = z.array(z.string());

// ── Machines (one design within a project, built `quantity` times) ──

const MachineName = z.string().trim().min(1, "Required").max(200);
export const Quantity = z.number().int().min(1, "At least 1");

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
  name: MachineName,
  quantity: Quantity.default(1),
  extra: Extra.default({}),
});
export type CreateMachineInput = z.infer<typeof CreateMachineInput>;

export const UpdateMachineInput = z
  .strictObject({ name: MachineName, quantity: Quantity, extra: Extra })
  .partial()
  .refine((m) => Object.keys(m).length > 0, "Nothing to update");
export type UpdateMachineInput = z.infer<typeof UpdateMachineInput>;

// ── Revisions (per machine, 1…999, shown with formatRev) ──

export const RevNumber = z.number().int().min(FIRST_REV).max(MAX_REV);

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

/** A revision as listed on the machine page, with who created / released it. */
export const RevisionSummary = MachineRevision.extend({
  createdBy: UserRef,
  releasedBy: UserRef.nullable(),
});
export type RevisionSummary = z.infer<typeof RevisionSummary>;

/** POST …/revisions/:rev/release. The note says what changed; required. */
export const ReleaseRevisionInput = z.object({
  notes: z.string().trim().min(1, "Describe what changed in this revision").max(2000),
});
export type ReleaseRevisionInput = z.infer<typeof ReleaseRevisionInput>;

// ── Detail views ──

/** A machine row on the project page, with its newest revision. */
export const MachineSummary = Machine.pick({ id: true, name: true, quantity: true }).extend({
  latestRevision: MachineRevision.pick({ rev: true, status: true }),
});
export type MachineSummary = z.infer<typeof MachineSummary>;

/** GET /api/projects/:projectId */
export const ProjectDetail = Project.extend({
  createdBy: UserRef,
  machines: z.array(MachineSummary),
  /** True when any machine has a released revision (only admins may delete then). */
  hasReleased: z.boolean(),
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

/** GET /api/projects/:projectId/machines/:machineId */
export const MachineDetail = Machine.extend({
  project: Project.pick({ id: true, name: true, customer: true }),
  createdBy: UserRef,
  /** Newest first. */
  revisions: z.array(RevisionSummary),
});
export type MachineDetail = z.infer<typeof MachineDetail>;

// ── Route parameters (arrive as strings) ──

export const ProjectParams = z.object({ projectId: z.coerce.number().int().positive() });
export const MachineParams = ProjectParams.extend({
  machineId: z.coerce.number().int().positive(),
});
export const RevisionParams = MachineParams.extend({ rev: z.coerce.number().pipe(RevNumber) });
