import { describe, expect, it } from "vitest";
import { ComponentInput } from "./component.js";
import { CreateMachineInput } from "./project.js";
import { CreateUserInput } from "./user.js";

const baseComponent = {
  typeId: null,
  manufacturer: "Acme",
  partNumber: "X-1",
  code: null,
  description: null,
  inputVoltage: null,
  phases: null,
  height: 900,
  width: 52,
  depth: 600,
  railMount: true,
  railEdgeOffset: 200,
  stackable: true,
  imagePath: null,
  active: true,
};

describe("ComponentInput", () => {
  it("accepts kind-specific attributes", () => {
    expect(
      ComponentInput.safeParse({
        ...baseComponent,
        kind: "FUSE",
        attributes: { amperage: 10, poles: 1 },
      }).success,
    ).toBe(true);
    expect(
      ComponentInput.safeParse({
        ...baseComponent,
        kind: "TERMINAL_BLOCK",
        attributes: { levels: 2 },
      }).success,
    ).toBe(true);
  });

  it("rejects attributes that belong to another kind", () => {
    expect(
      ComponentInput.safeParse({ ...baseComponent, kind: "STANDARD", attributes: { levels: 2 } })
        .success,
    ).toBe(false);
    expect(
      ComponentInput.safeParse({ ...baseComponent, kind: "FUSE", attributes: {} }).success,
    ).toBe(false);
  });

  it("rejects fractional lengths", () => {
    expect(
      ComponentInput.safeParse({ ...baseComponent, kind: "STANDARD", attributes: {}, width: 5.2 })
        .success,
    ).toBe(false);
  });

  it("rejects a rail offset on a component that isn't rail mounted", () => {
    expect(
      ComponentInput.safeParse({
        ...baseComponent,
        kind: "STANDARD",
        attributes: {},
        railMount: false,
      }).success,
    ).toBe(false);
  });
});

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
