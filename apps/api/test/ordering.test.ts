import { describe, expect, it } from "vitest";
import {
  POSITION_STEP,
  needsRebalance,
  positionAtIndex,
  positionBetween,
  rebalancedPositions,
} from "@synkro/shared";

const items = (...positions: number[]) => positions.map((position, i) => ({ id: `i${i}`, position }));

describe("positionBetween", () => {
  it("starts an empty container at one step", () => {
    expect(positionBetween(undefined, undefined)).toBe(POSITION_STEP);
  });

  it("places before the first and after the last item", () => {
    expect(positionBetween(undefined, 1024)).toBeLessThan(1024);
    expect(positionBetween(1024, undefined)).toBeGreaterThan(1024);
  });

  it("takes the midpoint between neighbours", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
});

describe("positionAtIndex", () => {
  const list = items(1024, 2048, 3072);

  it("inserts at the head, middle and tail", () => {
    expect(positionAtIndex(list, 0)).toBeLessThan(1024);
    expect(positionAtIndex(list, 1)).toBe(1536);
    expect(positionAtIndex(list, 3)).toBeGreaterThan(3072);
  });

  it("clamps out-of-range indexes", () => {
    expect(positionAtIndex(list, 99)).toBe(positionAtIndex(list, 3));
    expect(positionAtIndex(list, -5)).toBe(positionAtIndex(list, 0));
  });
});

describe("rebalancing", () => {
  it("detects exhausted gaps after repeated bisection", () => {
    let prev = 1024;
    let next = 2048;
    let steps = 0;
    while (!needsRebalance(prev, next)) {
      next = positionBetween(prev, next);
      steps++;
    }
    // Float64 gives roughly 30 bisections at this magnitude before hitting MIN_GAP.
    expect(steps).toBeGreaterThan(20);
  });

  it("renumbers evenly while preserving order", () => {
    const positions = rebalancedPositions(items(1, 1.0000001, 1.0000002));
    expect(Object.values(positions)).toEqual([POSITION_STEP, 2 * POSITION_STEP, 3 * POSITION_STEP]);
  });
});
