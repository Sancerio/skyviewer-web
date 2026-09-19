import type { Location } from "./sky";
export const PREFERENCES_KEY = "skyviewer-web.preferences.v1";
export type Preferences = { onboarded: boolean; magnitudeLimit: number; savedPlace: Location | null };
const defaults = (): Preferences => ({ onboarded: false, magnitudeLimit: 6, savedPlace: null });
export function validPlace(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  const p = value as Location;
  return typeof p.name === "string" && p.name.length > 0 && p.name.length <= 80 &&
    typeof p.latitude === "number" && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === "number" && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}
export function parsePreferences(text: string | null): Preferences {
  try {
    const p = JSON.parse(text ?? "null");
    if (!p || p.version !== 1) return defaults();
    return { onboarded: p.onboarded === true,
      magnitudeLimit: typeof p.magnitudeLimit === "number" && Number.isFinite(p.magnitudeLimit) && p.magnitudeLimit >= 0 && p.magnitudeLimit <= 6 ? p.magnitudeLimit : 6,
      savedPlace: validPlace(p.savedPlace) ? p.savedPlace : null };
  } catch { return defaults(); }
}
export function readPreferences(): Preferences {
  try { return parsePreferences(localStorage.getItem(PREFERENCES_KEY)); }
  catch { return defaults(); }
}
/** Returns false on blocked/full storage; current-session use must still work. */
export function savePreferences(patch: Partial<Preferences>): boolean {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, ...readPreferences(), ...patch })); return true; }
  catch { return false; }
}
export function forgetPreferences(): boolean {
  try { localStorage.removeItem(PREFERENCES_KEY); return true; } catch { return false; }
}
export function observingPlace(location: Location): Location {
  // Explicit opt-in only. Round GPS coordinates to roughly a kilometre; this is
  // a fixed observing place, never a claim that the user is still there.
  return { name: location.name === "Your location" ? "Saved observing place" : location.name,
    latitude: Math.round(location.latitude * 100) / 100,
    longitude: Math.round(location.longitude * 100) / 100 };
}
