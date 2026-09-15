import { describe, expect, it } from "vitest";

import {
  direction,
  getConstellationLines,
  getSky,
  getSunAltitude,
  project,
  type Location,
} from "./sky";

const greenwich: Location = {
  name: "Greenwich",
  latitude: 51.4779,
  longitude: 0,
};
const equator: Location = { name: "Equator", latitude: 0, longitude: 0 };

describe("solar altitude reference cases", () => {
  it("places the equinox Sun almost overhead at the equator around local noon", () => {
    const altitude = getSunAltitude(new Date("2024-03-20T12:00:00Z"), equator);
    expect(altitude).toBeGreaterThan(88);
    expect(altitude).toBeLessThanOrEqual(90);
  });

  it("places the June-solstice Sun above the north pole and below the south pole", () => {
    const date = new Date("2024-06-20T20:51:00Z");
    const north = getSunAltitude(date, {
      name: "North Pole",
      latitude: 90,
      longitude: 0,
    });
    const south = getSunAltitude(date, {
      name: "South Pole",
      latitude: -90,
      longitude: 0,
    });

    expect(north).toBeCloseTo(23.44, 0);
    expect(south).toBeCloseTo(-23.44, 0);
  });
});

describe("getSky", () => {
  it("returns the complete magnitude-6 catalog plus Sun, Moon, and planets", () => {
    const sky = getSky(new Date("2026-09-15T00:00:00Z"), greenwich);

    expect(sky).toHaveLength(5_053);
    expect(new Set(sky.map((object) => object.id))).toHaveLength(5_053);
    expect(sky.find((object) => object.id === "sun")).toMatchObject({
      name: "Sun",
      kind: "sun",
    });
    expect(sky.find((object) => object.name === "Sirius")).toMatchObject({
      id: "hip-32349",
      constellation: "Canis Major",
    });
    expect(
      sky.every(
        (object) =>
          Number.isFinite(object.altitude) && Number.isFinite(object.azimuth),
      ),
    ).toBe(true);
  });

  it("changes the local sky with observation time and longitude", () => {
    const date = new Date("2026-09-15T00:00:00Z");
    const later = getSky(new Date("2026-09-15T06:00:00Z"), greenwich);
    const east = getSky(date, {
      name: "90 east",
      latitude: greenwich.latitude,
      longitude: 90,
    });
    const now = getSky(date, greenwich);
    const siriusNow = now.find((object) => object.id === "hip-32349")!;
    const siriusLater = later.find((object) => object.id === "hip-32349")!;
    const siriusEast = east.find((object) => object.id === "hip-32349")!;

    expect(Math.abs(siriusLater.altitude - siriusNow.altitude)).toBeGreaterThan(
      20,
    );
    expect(Math.abs(siriusEast.altitude - siriusNow.altitude)).toBeGreaterThan(
      20,
    );
  });
});

describe("constellation figures", () => {
  it("returns all 88 constellations and merges both halves of Serpens", () => {
    const lines = getConstellationLines(
      new Date("2026-09-15T00:00:00Z"),
      greenwich,
    );
    const serpens = lines.find((line) => line.name === "Serpens");

    expect(lines).toHaveLength(88);
    expect(serpens?.points.length).toBeGreaterThanOrEqual(2);
    expect(
      lines.every((line) =>
        line.points
          .flat()
          .every(
            (point) =>
              Number.isFinite(point.altitude) && Number.isFinite(point.azimuth),
          ),
      ),
    ).toBe(true);
  });
});

describe("direction", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [225, "SW"],
    [359, "N"],
    [-90, "W"],
  ])("maps %s degrees to %s", (azimuth, expected) => {
    expect(direction(azimuth)).toBe(expected);
  });
});

describe("project", () => {
  it("puts the view direction at the center of the canvas", () => {
    const result = project(25, 135, 135, 25, 90, 800, 400);
    expect(result.x).toBeCloseTo(400, 10);
    expect(result.y).toBeCloseTo(200, 10);
    expect(result.visible).toBe(true);
  });

  it("keeps coordinates finite and rejects points behind the camera", () => {
    const result = project(0, 180, 0, 0, 90, 800, 400);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(result.visible).toBe(false);
  });

  it("marks a front-facing point outside the field of view as invisible", () => {
    expect(project(0, 60, 0, 0, 90, 800, 400).visible).toBe(false);
  });
});

describe("input and projection boundaries", () => {
  it("rejects invalid dates and out-of-range observer coordinates", () => {
    expect(() => getSky(new Date("invalid"), equator)).toThrow(RangeError);
    expect(() =>
      getSky(new Date("2026-09-15T00:00:00Z"), {
        name: "Invalid",
        latitude: 91,
        longitude: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      getSky(new Date("2026-09-15T00:00:00Z"), {
        name: "Invalid",
        latitude: 0,
        longitude: 181,
      }),
    ).toThrow(RangeError);
    expect(() => project(0, 0, 0, 0, 180, 960, 540)).toThrow(RangeError);
    expect(() => project(0, 0, 0, 0, 90, 0, 540)).toThrow(RangeError);
  });
  it("keeps zenith finite and places east to the right of north", () => {
    const zenith = project(90, 0, 0, 90, 90, 960, 540);
    expect(zenith.visible).toBe(true);
    expect(zenith.x).toBeCloseTo(480, 6);
    expect(zenith.y).toBeCloseTo(270, 6);
    const eastOfNorth = project(0, 30, 0, 0, 90, 960, 540);
    const westOfNorth = project(0, 330, 0, 0, 90, 960, 540);
    expect(eastOfNorth.x).toBeGreaterThan(480);
    expect(westOfNorth.x).toBeLessThan(480);
  });
});
