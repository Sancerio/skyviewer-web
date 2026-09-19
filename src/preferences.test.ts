import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePreferences, observingPlace, readPreferences, savePreferences, PREFERENCES_KEY, validPlace } from "./preferences";
afterEach(() => vi.unstubAllGlobals());
describe("returning-user preferences are not permission grants", () => {
  it.each([null, "", "not json", "null", '{"version":999}', '[]'])("safely defaults for %s", input => {
    expect(parsePreferences(input)).toEqual({ onboarded: false, magnitudeLimit: 6, savedPlace: null });
  });
  it("restores preferences but ignores fake permission flags", () => {
    expect(parsePreferences(JSON.stringify({ version: 1, onboarded: true, magnitudeLimit: 4.5, cameraGranted: true, motionGranted: true })))
      .toEqual({ onboarded: true, magnitudeLimit: 4.5, savedPlace: null });
  });
  it("validates location ranges and types before use", () => {
    for (const place of [{ name: "a", latitude: 91, longitude: 0 }, { name: "a", latitude: "0", longitude: 0 }, { name: "a", latitude: 0, longitude: 181 }, null]) {
      expect(validPlace(place)).toBe(false);
      expect(parsePreferences(JSON.stringify({ version: 1, savedPlace: place })).savedPlace).toBeNull();
    }
  });
  it("saves an approximate fixed place, never labels it live GPS", () => {
    expect(observingPlace({ name: "Your location", latitude: -34.9285, longitude: 138.6007 }))
      .toEqual({ name: "Saved observing place", latitude: -34.93, longitude: 138.6 });
  });
  it("does not crash when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } });
    expect(readPreferences().onboarded).toBe(false); expect(savePreferences({ onboarded: true })).toBe(false);
  });
  it("writes only the app's namespaced key and merges settings", () => {
    let value: string | null = null;
    const setItem = vi.fn((_key: string, text: string) => { value = text; });
    vi.stubGlobal("localStorage", { getItem: () => value, setItem });
    savePreferences({ magnitudeLimit: 3 }); savePreferences({ onboarded: true });
    expect(setItem.mock.calls.every(call => call[0] === PREFERENCES_KEY)).toBe(true);
    expect(readPreferences()).toEqual({ onboarded: true, magnitudeLimit: 3, savedPlace: null });
  });
});
