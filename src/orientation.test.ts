import { describe, expect, it } from "vitest";

import {
  deviceAttitude,
  effectiveHorizontalFov,
  projectAR,
  type Vector3,
} from "./orientation";

const expectVector = (actual: Vector3, expected: Vector3) => {
  expected.forEach((value, index) =>
    expect(actual[index]).toBeCloseTo(value, 10),
  );
};

const expectCentered = (result: ReturnType<typeof projectAR>) => {
  expect(result.x).toBeCloseTo(400, 8);
  expect(result.y).toBeCloseTo(300, 8);
  expect(result.visible).toBe(true);
};

describe("deviceAttitude physical references", () => {
  it("points an upright portrait rear camera north along the horizon", () => {
    const attitude = deviceAttitude(0, 90, 0, 0);

    expectVector(attitude.right, [1, 0, 0]);
    expectVector(attitude.up, [0, 0, 1]);
    expectVector(attitude.forward, [0, 1, 0]);
    expectCentered(projectAR(0, 0, attitude, 60, 800, 600));
  });

  it("turns the upright camera west when alpha is 90 degrees", () => {
    const attitude = deviceAttitude(90, 90, 0, 0);

    expectVector(attitude.forward, [-1, 0, 0]);
    expectCentered(projectAR(0, 270, attitude, 60, 800, 600));
  });

  it("points a flat phone's rear camera down", () => {
    const attitude = deviceAttitude(0, 0, 0, 0);

    expectVector(attitude.forward, [0, 0, -1]);
    expectCentered(projectAR(-90, 0, attitude, 60, 800, 600));
  });

  it("points the rear camera at the zenith when beta is 180 degrees", () => {
    const attitude = deviceAttitude(0, 180, 0, 0);

    expectVector(attitude.forward, [0, 0, 1]);
    expectCentered(projectAR(90, 0, attitude, 60, 800, 600));
  });

  it("rotates screen right and up for a 90-degree landscape screen", () => {
    const attitude = deviceAttitude(0, 90, 0, 90);

    expectVector(attitude.right, [0, 0, 1]);
    expectVector(attitude.up, [-1, 0, 0]);
    expectVector(attitude.forward, [0, 1, 0]);
  });

  it("applies a clockwise manual heading calibration", () => {
    const attitude = deviceAttitude(0, 90, 0, 0, 90);

    expectVector(attitude.forward, [1, 0, 0]);
    expectCentered(projectAR(0, 90, attitude, 60, 800, 600));
  });
});

describe("projectAR", () => {
  it("moves an elevated label sideways when the phone rolls around its look direction", () => {
    const level = deviceAttitude(0, 90, 0, 0);
    // These Z-X'-Y'' angles are the same north-facing camera rolled 30 degrees.
    const rolled = deviceAttitude(270, 60, 90, 0);
    const levelLabel = projectAR(20, 0, level, 60, 800, 600);
    const rolledLabel = projectAR(20, 0, rolled, 60, 800, 600);

    expect(levelLabel.x).toBeCloseTo(400, 8);
    expect(rolledLabel.x).toBeLessThan(350);
    expect(rolledLabel.y).toBeLessThan(300);
  });

  it("rejects the rear hemisphere and keeps its coordinates finite", () => {
    const attitude = deviceAttitude(0, 90, 0, 0);
    const rear = projectAR(0, 180, attitude, 60, 800, 600);

    expect(rear.visible).toBe(false);
    expect(Number.isFinite(rear.x)).toBe(true);
    expect(Number.isFinite(rear.y)).toBe(true);
  });
});

describe("effectiveHorizontalFov", () => {
  it("preserves landscape FOV when video and viewport dimensions match", () => {
    expect(effectiveHorizontalFov(90, 1920, 1080, 1920, 1080)).toBeCloseTo(
      90,
      10,
    );
  });

  it("accounts for horizontal object-fit cover cropping in a portrait viewport", () => {
    const fov = effectiveHorizontalFov(90, 1920, 1080, 1080, 1920);

    // Cover shows 607.5 of 1920 source pixels horizontally; at 90-degree
    // landscape FOV this is approximately 35.1 degrees.
    expect(fov).toBeCloseTo(35.12, 2);
    expect(fov).toBeLessThan(90);
  });

  it("uses actual portrait camera dimensions for an uncropped portrait feed", () => {
    expect(effectiveHorizontalFov(90, 1080, 1920, 1080, 1920)).toBeCloseTo(
      58.72,
      2,
    );
  });
});
