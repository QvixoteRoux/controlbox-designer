import { describe, expect, it } from "vitest";
import { can, type Permission } from "./permissions.js";
import type { Role } from "./schemas/enums.js";

const user = (role: Role, canProjects = true, canComponents = true) => ({
  role,
  canProjects,
  canComponents,
});

const ALL: Permission[] = ["projects", "components", "admin"];

describe("can", () => {
  it("lets an ADMIN do everything, whatever the flags say", () => {
    for (const p of ALL) {
      expect(can(user("ADMIN", false, false), p)).toBe(true);
    }
  });

  it("lets a VIEWER do nothing, whatever the flags say", () => {
    for (const p of ALL) {
      expect(can(user("VIEWER", true, true), p)).toBe(false);
    }
  });

  it("gives a DESIGNER projects and components by their flags", () => {
    expect(can(user("DESIGNER", true, true), "projects")).toBe(true);
    expect(can(user("DESIGNER", true, true), "components")).toBe(true);

    expect(can(user("DESIGNER", true, false), "projects")).toBe(true);
    expect(can(user("DESIGNER", true, false), "components")).toBe(false);

    expect(can(user("DESIGNER", false, true), "projects")).toBe(false);
    expect(can(user("DESIGNER", false, true), "components")).toBe(true);
  });

  it("never gives a DESIGNER admin", () => {
    expect(can(user("DESIGNER", true, true), "admin")).toBe(false);
  });
});
