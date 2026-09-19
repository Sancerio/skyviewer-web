import { describe, expect, it } from "vitest";
import { normalizeOrientation, wrap180, wrap360 } from "./compass";
import { deviceAttitude, projectAR } from "./orientation";
const reading = { alpha: 123, beta: 120, gamma: 0, absolute: false };
describe("automatic compass reference", () => {
  it("uses iPhone compass without a flat-phone or manual north step", () => {
    const sample = normalizeOrientation({ ...reading, webkitCompassHeading: 80, webkitCompassAccuracy: 8 })!;
    expect(sample.reference).toBe("webkit"); expect(sample.absolute).toBe(true);
    expect(sample.alpha).toBe(280); expect(sample.beta).toBe(120);
    const p = projectAR(30, 80, deviceAttitude(sample.alpha, sample.beta, sample.gamma, 0), 40, 400, 800);
    expect(p.visible).toBe(true); expect(p.x).toBeCloseTo(200); expect(p.y).toBeCloseTo(400);
  });
  it("applies east-positive true north correction with the correct sign", () => {
    const sample = normalizeOrientation({ ...reading, webkitCompassHeading: 80, webkitCompassAccuracy: 8 })!;
    const p = projectAR(30, 88, deviceAttitude(sample.alpha, sample.beta, sample.gamma, 0, 8), 40, 400, 800);
    expect(p.x).toBeCloseTo(200); expect(p.y).toBeCloseTo(400);
  });
  it("accepts absolute Android events, including the absolute event type", () => {
    expect(normalizeOrientation({ ...reading, absolute: true })?.reference).toBe("absolute");
    expect(normalizeOrientation({ ...reading, type: "deviceorientationabsolute" })?.absolute).toBe(true);
  });
  it.each([-1, NaN, Infinity])("never treats invalid compass accuracy %s as north", accuracy => {
    expect(normalizeOrientation({ ...reading, webkitCompassHeading: 0, webkitCompassAccuracy: accuracy })?.absolute).toBe(false);
  });
  it.each([null, NaN, Infinity])("rejects invalid angles %s rather than placing objects at north", alpha => {
    expect(normalizeOrientation({ ...reading, alpha })).toBeNull();
  });
  it("does not invent north from relative-only sensors", () => { expect(normalizeOrientation(reading)?.absolute).toBe(false); });
  it("wraps compass crossings without 360-degree jumps", () => { expect(wrap360(-1)).toBe(359); expect(wrap180(359)).toBe(-1); });
});
