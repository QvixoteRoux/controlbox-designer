import type { User } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import { isLastActiveAdmin } from "./api";

const user = (id: number, role: User["role"], active = true): User => ({
  id,
  username: `u${id}`,
  displayName: `User ${id}`,
  role,
  canProjects: true,
  canComponents: true,
  active,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("isLastActiveAdmin", () => {
  it("is true for the only active admin", () => {
    const admin = user(1, "ADMIN");
    expect(isLastActiveAdmin(admin, [admin, user(2, "DESIGNER")])).toBe(true);
  });

  it("ignores inactive admins", () => {
    const admin = user(1, "ADMIN");
    expect(isLastActiveAdmin(admin, [admin, user(2, "ADMIN", false)])).toBe(true);
  });

  it("is false when another active admin exists", () => {
    const admin = user(1, "ADMIN");
    expect(isLastActiveAdmin(admin, [admin, user(2, "ADMIN")])).toBe(false);
  });

  it("is false for non-admins and inactive admins", () => {
    const admin = user(1, "ADMIN");
    expect(isLastActiveAdmin(user(2, "DESIGNER"), [admin])).toBe(false);
    expect(isLastActiveAdmin(user(3, "ADMIN", false), [admin])).toBe(false);
  });
});
