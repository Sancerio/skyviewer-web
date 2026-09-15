import { describe, expect, it } from "vitest";

import { clipLineToViewport } from "./clip";
import { project } from "./sky";

describe("clipLineToViewport", () => {
  it("clips a segment whose two endpoints are outside opposite viewport edges", () => {
    const clipped = clipLineToViewport(
      { x: -40, y: 25, inFront: true },
      { x: 140, y: 75, inFront: true },
      100,
      100,
    );

    expect(clipped).not.toBeNull();
    expect(clipped![0].x).toBe(0);
    expect(clipped![0].y).toBeCloseTo(36.111111, 5);
    expect(clipped![1].x).toBe(100);
    expect(clipped![1].y).toBeCloseTo(63.888889, 5);
  });

  it("preserves the reviewer's long Andromeda segment when both endpoints are visible", () => {
    const start = { x: 732.85, y: 397.55, inFront: true };
    const end = { x: 227.15, y: 142.45, inFront: true };

    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(
      960 / 2,
    );
    expect(clipLineToViewport(start, end, 960, 540)).toEqual([
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ]);
  });

  it("rejects a segment that crosses from the front into the rear hemisphere", () => {
    const front = project(0, 0, 0, 0, 90, 100, 100);
    const rear = project(0, 180, 0, 0, 90, 100, 100);

    expect(front.inFront).toBe(true);
    expect(rear.inFront).toBe(false);
    expect(clipLineToViewport(front, rear, 100, 100)).toBeNull();
  });

  it("rejects a front-facing segment entirely outside one viewport edge", () => {
    expect(
      clipLineToViewport(
        { x: -20, y: 10, inFront: true },
        { x: -10, y: 90, inFront: true },
        100,
        100,
      ),
    ).toBeNull();
  });
});
