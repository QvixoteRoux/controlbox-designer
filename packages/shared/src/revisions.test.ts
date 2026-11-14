import { describe, expect, it } from "vitest";
import { formatRev } from "./revisions.js";

describe("formatRev", () => {
  it.each([
    [0, "Rev 000"],
    [7, "Rev 007"],
    [42, "Rev 042"],
    [999, "Rev 999"],
  ])("%d → %s", (rev, label) => {
    expect(formatRev(rev)).toBe(label);
  });

  it.each([-1, 1000, 1.5, Number.NaN])("rejects %d", (rev) => {
    expect(() => formatRev(rev)).toThrow(RangeError);
  });
});
