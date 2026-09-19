import { describe, expect, it } from "vitest";
import { magneticDeclination } from "./declination";
// NOAA NCEI WMM2025_TEST_VALUES.txt, columns 1..4 and 11. 240E = -120E.
const cases = [
  [2025,0,80,0,1.28], [2025,0,0,120,-.16], [2025,0,-80,-120,68.78],
  [2025,100,80,0,.85], [2025,100,0,120,-.15], [2025,100,-80,-120,68.21],
  [2027.5,0,80,0,2.59], [2027.5,0,0,120,-.24], [2027.5,0,-80,-120,68.49],
  [2027.5,100,80,0,2.16], [2027.5,100,0,120,-.23], [2027.5,100,-80,-120,67.93],
];
describe("offline WMM2025 declination", () => {
  it.each(cases)("matches NOAA at year %s, altitude %s, latitude %s, longitude %s", (year, altitude, lat, lon, expected) => {
    const y = Math.floor(year);
    const date = new Date(Date.UTC(y,0,1) + (year-y) * (Date.UTC(y+1,0,1)-Date.UTC(y,0,1)));
    expect(Math.abs(magneticDeclination(lat,lon,date,altitude)! - expected)).toBeLessThan(.01);
  });
  it("does not silently extrapolate an expired model", () => { expect(magneticDeclination(0,0,new Date("2030-01-01"))).toBeNull(); });
  it("reports unavailable at the poles and for invalid inputs", () => {
    for (const latitude of [90, -90, NaN]) expect(magneticDeclination(latitude,0,new Date("2026-01-01"))).toBeNull();
    expect(magneticDeclination(0,0,new Date("invalid"))).toBeNull();
  });
});
