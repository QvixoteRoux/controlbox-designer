import { describe, expect, it } from "vitest";
import {
  BUILT_IN_RAIL,
  canMountInHole,
  ComponentInput,
  componentColumns,
  DEFAULT_STOCK_LENGTH,
  isBuiltIn,
  RAIL_WIDTH,
  stockLength,
  terminalLevels,
} from "./component.js";
import { ComponentKind } from "./enums.js";
import { isStrip } from "./placement.js";

const identity = { manufacturer: "Acme", partNumber: "X-1" };
const box = { height: 900, width: 52, depth: 600 };

const parse = (input: object) => ComponentInput.safeParse(input);

describe("ComponentInput", () => {
  it("accepts each kind with only its own fields, filling defaults", () => {
    expect(parse({ kind: "STANDARD", ...identity, ...box }).success).toBe(true);
    expect(
      parse({ kind: "FUSE", ...identity, ...box, attributes: { amperage: 10, poles: 1 } }).success,
    ).toBe(true);
    expect(
      parse({
        kind: "TERMINAL_BLOCK",
        ...identity,
        ...box,
        railEdgeOffset: 200,
        attributes: { levels: 2 },
      }).success,
    ).toBe(true);
    expect(
      parse({ kind: "GROUND_TERMINAL", ...identity, ...box, railEdgeOffset: 200 }).success,
    ).toBe(true);
    expect(parse({ kind: "GUTTER", ...identity, width: 600 }).success).toBe(true);
    expect(parse({ kind: "RAIL", code: "R1" }).success).toBe(true);
  });

  it("allows terminal blocks of 1 to 4 levels", () => {
    const terminal = (levels: number) =>
      parse({
        kind: "TERMINAL_BLOCK",
        ...identity,
        ...box,
        railEdgeOffset: 0,
        attributes: { levels },
      }).success;
    expect([0, 1, 2, 3, 4, 5].map(terminal)).toEqual([false, true, true, true, true, false]);
  });

  it("needs a rail offset for terminals", () => {
    expect(parse({ kind: "GROUND_TERMINAL", ...identity, ...box }).success).toBe(false);
  });

  it("rejects attributes that belong to another kind", () => {
    expect(
      parse({ kind: "STANDARD", ...identity, ...box, attributes: { levels: 2 } }).success,
    ).toBe(false);
    expect(parse({ kind: "FUSE", ...identity, ...box, attributes: {} }).success).toBe(false);
    expect(
      parse({
        kind: "GROUND_TERMINAL",
        ...identity,
        ...box,
        railEdgeOffset: 0,
        attributes: { levels: 2 },
      }).success,
    ).toBe(false);
  });

  it("rejects fractional lengths", () => {
    expect(parse({ kind: "STANDARD", ...identity, ...box, width: 5.2 }).success).toBe(false);
  });

  it("rejects a rail offset on a component that isn't rail mounted", () => {
    expect(parse({ kind: "STANDARD", ...identity, ...box, railEdgeOffset: 200 }).success).toBe(
      false,
    );
    expect(
      parse({ kind: "STANDARD", ...identity, ...box, railMount: true, railEdgeOffset: 200 })
        .success,
    ).toBe(true);
  });

  it("turns empty optional text into null", () => {
    const r = ComponentInput.parse({
      kind: "STANDARD",
      ...identity,
      ...box,
      code: " ",
      description: "",
    });
    expect(r).toMatchObject({ code: null, description: null });
  });
});

describe("componentColumns", () => {
  it("fixes the built-in rail: TS35 × 7.5, 2000 mm stock, only type/code/description editable", () => {
    const cols = componentColumns(
      ComponentInput.parse({
        kind: "RAIL",
        code: "DIN",
        description: "My rail",
        // Ignored: the rail's identity and sizes are fixed.
        manufacturer: "Acme",
        depth: 150,
        active: false,
      }),
    );
    expect(cols).toMatchObject({
      manufacturer: BUILT_IN_RAIL.manufacturer,
      partNumber: BUILT_IN_RAIL.partNumber,
      code: "DIN",
      description: "My rail",
      width: RAIL_WIDTH,
      height: 0,
      depth: 75,
      active: true,
      railMount: false,
      railEdgeOffset: null,
      attributes: { stockLength: DEFAULT_STOCK_LENGTH },
    });
    expect(isBuiltIn({ kind: "RAIL" })).toBe(true);
    expect(isBuiltIn({ kind: "GUTTER" })).toBe(false);
  });

  it("keeps a gutter's height for 3D only, 0 when not given", () => {
    expect(
      componentColumns(ComponentInput.parse({ kind: "GUTTER", ...identity, width: 600 })),
    ).toMatchObject({ width: 600, height: 0, depth: 0 });
  });

  it("always mounts terminals on the rail, snappable by default", () => {
    expect(
      componentColumns(
        ComponentInput.parse({ kind: "GROUND_TERMINAL", ...identity, ...box, railEdgeOffset: 150 }),
      ),
    ).toMatchObject({ railMount: true, railEdgeOffset: 150, snappable: true, inputVoltage: null });
  });

  it("makes every part snappable by default, unless switched off", () => {
    const standard = { kind: "STANDARD", ...identity, ...box, railMount: true };
    expect(componentColumns(ComponentInput.parse(standard)).snappable).toBe(true);
    expect(
      componentColumns(ComponentInput.parse({ ...standard, snappable: false })).snappable,
    ).toBe(false);
  });

  it("takes a safety device with the same fields as a standard part", () => {
    const input = {
      ...identity,
      ...box,
      inputVoltage: "24 V DC",
      railMount: true,
      railEdgeOffset: 200,
    };
    const safety = componentColumns(ComponentInput.parse({ kind: "SAFETY", ...input }));
    const standard = componentColumns(ComponentInput.parse({ kind: "STANDARD", ...input }));
    expect(safety).toEqual({ ...standard, kind: "SAFETY" });
    expect(canMountInHole("SAFETY")).toBe(true);
    expect(ComponentKind.options.indexOf("SAFETY")).toBe(
      ComponentKind.options.indexOf("STANDARD") + 1,
    );
  });

  it("lets Standard, Safety and Fuse parts be expandable, never terminals or profiles", () => {
    const fields = { ...identity, ...box, expandable: true };
    const columns = (input: object) => componentColumns(ComponentInput.parse(input));
    expect(columns({ kind: "STANDARD", ...identity, ...box }).expandable).toBe(false);
    expect(columns({ kind: "STANDARD", ...fields }).expandable).toBe(true);
    expect(columns({ kind: "SAFETY", ...fields }).expandable).toBe(true);
    expect(
      columns({ kind: "FUSE", ...fields, attributes: { amperage: 10, poles: 1 } }).expandable,
    ).toBe(true);
    expect(
      columns({ kind: "TERMINAL_BLOCK", ...fields, railEdgeOffset: 150, attributes: { levels: 1 } })
        .expandable,
    ).toBe(false);
    expect(columns({ kind: "GUTTER", ...identity, width: 600, expandable: true }).expandable).toBe(
      false,
    );
  });

  it("places terminals and expandable parts as strips", () => {
    expect(isStrip({ kind: "TERMINAL_BLOCK" })).toBe(true);
    expect(isStrip({ kind: "STANDARD", expandable: false })).toBe(false);
    expect(isStrip({ kind: "STANDARD", expandable: true })).toBe(true);
  });

  it("drops electrical fields on kinds that don't use them", () => {
    const cols = componentColumns(
      ComponentInput.parse({
        kind: "GUTTER",
        ...identity,
        width: 600,
        inputVoltage: "24VDC",
        phases: 3,
      }),
    );
    expect(cols).toMatchObject({ inputVoltage: null, phases: null });
  });
});

describe("attribute helpers", () => {
  it("reads terminal levels and stock lengths", () => {
    expect(terminalLevels({ kind: "TERMINAL_BLOCK", attributes: { levels: 3 } })).toBe(3);
    expect(terminalLevels({ kind: "GROUND_TERMINAL", attributes: {} })).toBe(1);
    expect(terminalLevels({ kind: "STANDARD", attributes: {} })).toBe(0);
    expect(stockLength({ kind: "RAIL", attributes: { stockLength: 10000 } })).toBe(10000);
    expect(stockLength({ kind: "GUTTER", attributes: {} })).toBe(DEFAULT_STOCK_LENGTH);
    expect(stockLength({ kind: "FUSE", attributes: {} })).toBeNull();
  });
});
