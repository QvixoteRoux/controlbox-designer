import { describe, expect, it } from "vitest";
import { CreateMachineInput } from "./project.js";
import { CreateUserInput } from "./user.js";

describe("CreateUserInput", () => {
  const base = { username: "jdoe", displayName: "J. Doe", password: "long-enough" };

  it("defaults to VIEWER", () => {
    expect(CreateUserInput.parse(base).role).toBe("VIEWER");
  });

  it("requires a DESIGNER to keep at least one permission", () => {
    expect(
      CreateUserInput.safeParse({
        ...base,
        role: "DESIGNER",
        canProjects: false,
        canComponents: false,
      }).success,
    ).toBe(false);
    expect(
      CreateUserInput.safeParse({ ...base, role: "DESIGNER", canProjects: false }).success,
    ).toBe(true);
  });
});

describe("CreateMachineInput", () => {
  it("defaults quantity to 1 and rejects 0", () => {
    expect(CreateMachineInput.parse({ name: "Line A" }).quantity).toBe(1);
    expect(CreateMachineInput.safeParse({ name: "Line A", quantity: 0 }).success).toBe(false);
  });
});
