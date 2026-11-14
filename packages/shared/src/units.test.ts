import { describe, expect, it } from "vitest";
import { toMm, toUnits } from "./units.js";

describe("toUnits", () => {
  it.each([
    [600, 6000],
    [5.2, 52],
    [35, 350],
    [0, 0],
    [0.1, 1],
    [-12.5, -125],
  ])("%d mm → %d units", (mm, units) => {
    expect(toUnits(mm)).toBe(units);
  });

  it("always returns an integer, even when the float product drifts", () => {
    // 5.2 * 10 === 52.00000000000001 and 0.7 * 10 === 7.000000000000001 in IEEE 754
    expect(Number.isInteger(toUnits(5.2))).toBe(true);
    expect(toUnits(0.7)).toBe(7);
  });

  it("rounds to the nearest 0.1 mm", () => {
    expect(toUnits(12.34)).toBe(123);
    expect(toUnits(12.36)).toBe(124);
  });
});

describe("toMm", () => {
  it.each([
    [6000, 600],
    [52, 5.2],
    [350, 35],
    [0, 0],
    [1, 0.1],
  ])("%d units → %d mm", (units, mm) => {
    expect(toMm(units)).toBe(mm);
  });

  it("round-trips every 0.1 mm step", () => {
    for (let u = -1000; u <= 1000; u++) {
      expect(toUnits(toMm(u))).toBe(u);
    }
  });
});
