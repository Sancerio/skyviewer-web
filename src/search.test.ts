import { describe, expect, it } from "vitest";

import { matchesObject, type SearchableSkyObject } from "./search";

const sirius: SearchableSkyObject = {
  id: "hip-32349",
  name: "Sirius",
  constellation: "Canis Major",
  aliases: ["Dog Star", "α Canis Majoris"],
};

describe("matchesObject", () => {
  it("matches names, identifiers, constellations, and aliases", () => {
    expect(matchesObject(sirius, "siri")).toBe(true);
    expect(matchesObject(sirius, "HIP32349")).toBe(true);
    expect(matchesObject(sirius, "hip 32349")).toBe(true);
    expect(matchesObject(sirius, "canis-major")).toBe(true);
    expect(matchesObject(sirius, "dog star")).toBe(true);
  });

  it("ignores Unicode diacritics", () => {
    const arcturus = {
      id: "hip-69673",
      name: "Arcturus",
      constellation: "Boötes",
    };

    expect(matchesObject(arcturus, "Bootes")).toBe(true);
    expect(
      matchesObject({ ...arcturus, constellation: "Bootes" }, "Boötes"),
    ).toBe(true);
  });

  it("treats Greek Bayer glyphs and spelled-out names as equivalent", () => {
    const alphaCentauri = {
      id: "hip-71683",
      name: "α Centauri",
      aliases: ["Rigil Kentaurus"],
    };

    expect(matchesObject(alphaCentauri, "Alpha Centauri")).toBe(true);
    expect(
      matchesObject({ ...alphaCentauri, name: "Alpha Centauri" }, "α Centauri"),
    ).toBe(true);
  });

  it("returns true for a blank query", () => {
    expect(matchesObject(sirius, "  ")).toBe(true);
  });

  it("returns false for a nonexistent object", () => {
    expect(matchesObject(sirius, "Betelgeuse")).toBe(false);
  });

  it("does not create a match by joining separate fields", () => {
    expect(
      matchesObject(
        { id: "example", name: "Alpha", constellation: "Centauri" },
        "Alpha Centauri",
      ),
    ).toBe(false);
  });
});
