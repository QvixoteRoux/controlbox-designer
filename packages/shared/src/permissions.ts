import type { Role } from "./schemas/enums.js";

export type Permission = "projects" | "components" | "admin";

/** The single permission check used by the API guards and the web UI (guidelines/permissions.md). */
export function can(
  user: { role: Role; canProjects: boolean; canComponents: boolean },
  p: Permission,
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role !== "DESIGNER") return false;
  if (p === "projects") return user.canProjects;
  if (p === "components") return user.canComponents;
  return false;
}
