import { describe, expect, it } from "vitest";
import { findWallDropTarget } from "../lib/wall-drag";

const slots = [
  { left: 0, top: 0, width: 100, height: 100 },
  { left: 150, top: 0, width: 100, height: 100 },
  { left: 0, top: 150, width: 100, height: 100 },
];

describe("wall drag target", () => {
  it("uses the carried cover's overlap even when the pointer is outside the target", () => {
    expect(findWallDropTarget(270, 50, 100, slots, 0)).toBe(1);
  });

  it("ignores tiny overlaps and the source slot", () => {
    expect(findWallDropTarget(290, 50, 100, slots, 0)).toBeNull();
    expect(findWallDropTarget(50, 50, 100, slots, 0)).toBeNull();
  });

  it("chooses the wall spot with the largest overlap", () => {
    expect(findWallDropTarget(75, 100, 100, slots, 1)).toBe(0);
    expect(findWallDropTarget(75, 205, 100, slots, 1)).toBe(2);
  });
});
