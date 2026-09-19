import { useCallback, useEffect, useRef, useState } from "react";
import type { Location } from "./sky";
import { readPreferences, savePreferences, observingPlace, validPlace } from "./preferences";
import { issueText, type IssueCode } from "./messages";
export const LOCATION_REUSE_MS = 5 * 60_000;
export function useObserver() {
  const [savedPlace, setSavedPlace] = useState(() => readPreferences().savedPlace);
  const [location, setLocation] = useState<Location | null>(savedPlace);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(savedPlace ? "ready" : "idle");
  const [source, setSource] = useState<"gps" | "manual" | "saved">(savedPlace ? "saved" : "gps");
  const [issue, setIssue] = useState<IssueCode | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const generation = useRef(0);
  const current = useRef({ location, source, fixAt });
  current.current = { location, source, fixAt };
  const pending = useRef<Promise<boolean> | null>(null);
  const settle = useRef<(ok: boolean) => void>(() => {});
  const cancel = useCallback(() => {
    generation.current++; settle.current(false); pending.current = null;
    setStatus(previous => previous === "loading" ? "idle" : previous);
  }, []);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("pagehide", cancel); document.addEventListener("visibilitychange", hide);
    return () => { cancel(); window.removeEventListener("pagehide", cancel); document.removeEventListener("visibilitychange", hide); };
  }, [cancel]);
  const choose = useCallback((value: Location) => {
    if (!validPlace(value)) return;
    cancel(); current.current = { location: value, source: "manual", fixAt: null };
    setLocation(value); setSource("manual"); setAccuracy(null); setFixAt(null); setStatus("ready"); setIssue(null);
  }, [cancel]);
  const request = useCallback((onSuccess?: () => void): Promise<boolean> => {
    // One acquisition, no concurrent getCurrentPosition + watchPosition prompts.
    if (pending.current) return pending.current.then(ok => { if (ok) onSuccess?.(); return ok; });
    const token = ++generation.current;
    setStatus("loading"); setIssue(null);
    let resolve!: (ok: boolean) => void;
    const result = new Promise<boolean>(r => { resolve = r; });
    pending.current = result; settle.current = resolve;
    const finish = (ok: boolean) => {
      if (token !== generation.current) return;
      pending.current = null; resolve(ok);
      if (ok) onSuccess?.();
    };
    const fail = (code: IssueCode) => {
      if (token !== generation.current) return;
      // A user-chosen fixed place is still usable; a failed current GPS request
      // must never be relabelled as a fresh fix.
      if (current.current.source === "gps") { setLocation(null); setAccuracy(null); setFixAt(null);
        current.current = { location: null, source: "gps", fixAt: null }; }
      setStatus("error"); setIssue(code); finish(false);
    };
    if (!window.isSecureContext) { fail("secure"); return result; }
    if (!navigator.geolocation) { fail("location-missing"); return result; }
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (token !== generation.current) return;
        const place = { name: "Your location", latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (!validPlace(place)) { fail("location-missing"); return; }
        const now = Date.now();
        const timestamp = Number.isFinite(position.timestamp) ? Math.min(position.timestamp, now) : now;
        current.current = { location: place, source: "gps", fixAt: timestamp };
        setLocation(place); setSource("gps"); setFixAt(timestamp);
        setAccuracy(Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0 ? position.coords.accuracy : null);
        setStatus("ready"); setIssue(null); finish(true);
      }, error => fail(error.code === 1 ? "location-denied" : error.code === 3 ? "location-timeout" : "location-missing"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    } catch { fail("location-missing"); }
    return result;
  }, []);
  const ensure = useCallback((): Promise<boolean> => {
    const value = current.current;
    const age = value.fixAt === null ? Infinity : Date.now() - value.fixAt;
    if (value.location && (value.source !== "gps" || (age >= 0 && age < LOCATION_REUSE_MS))) return Promise.resolve(true);
    return request();
  }, [request]);
  const remember = useCallback(() => {
    const place = current.current.location;
    if (!place) return false;
    const saved = observingPlace(place);
    if (!savePreferences({ savedPlace: saved })) return false;
    setSavedPlace(saved); return true;
  }, []);
  const forgetPlace = useCallback(() => {
    if (!savePreferences({ savedPlace: null })) return false;
    setSavedPlace(null);
    if (current.current.source === "saved") {
      cancel(); current.current = { location: null, source: "gps", fixAt: null };
      setLocation(null); setSource("gps"); setFixAt(null); setAccuracy(null); setStatus("idle");
    }
    return true;
  }, [cancel]);
  return { location, status, source, issue, error: issue ? issueText(issue) : "", accuracy, fixAt,
    request, ensure, choose, cancel, savedPlace, remember, forgetPlace };
}
export type ObserverState = ReturnType<typeof useObserver>;
