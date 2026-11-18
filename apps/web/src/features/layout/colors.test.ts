import { describe, expect, it } from "vitest";
import { textOn } from "./colors";

describe("textOn", () => {
  it("writes dark text on light fills and white text on dark ones", () => {
    expect(textOn("#ffec99")).toBe("#222");
    expect(textOn("#a5d8ff")).toBe("#222");
    expect(textOn("#1c3d8f")).toBe("#fff");
    expect(textOn("#000000")).toBe("#fff");
  });
});
