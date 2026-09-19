import { useCallback, useEffect, useRef, useState } from "react";
import type { Location } from "./sky";

export function useObserver() {
  const [location, setLocation] = useState<Location | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [source, setSource] = useState<"gps" | "manual">("gps");
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const generation = useRef(0);
  const watch = useRef<number | null>(null);
  const cancel = useCallback(() => {
    generation.current++;
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    setStatus(previous => previous === "loading" ? "idle" : previous);
  }, []);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => { cancel(); window.removeEventListener("pagehide", cancel); document.removeEventListener("visibilitychange", hide); };
  }, [cancel]);
  const choose = useCallback((value: Location) => {
    cancel();
    setLocation(value); setSource("manual"); setAccuracy(null);
    setStatus("ready"); setError("");
  }, [cancel]);
  const request = useCallback((onSuccess?: () => void) => {
    cancel();
    const token = generation.current;
    setSource("gps"); setLocation(null); setAccuracy(null);
    setStatus("loading"); setError("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus("error");
      setError("Location needs HTTPS and a browser with location access. Open this page in Safari or Chrome, or choose a location.");
      return;
    }
    let received = false;
    const success = (position: GeolocationPosition) => {
      if (token !== generation.current) return;
      const { latitude, longitude, accuracy: metres } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      setLocation({ name: "Your location", latitude, longitude });
      setAccuracy(Number.isFinite(metres) ? metres : null);
      setStatus("ready"); setError("");
      if (!received) { received = true; onSuccess?.(); }
    };
    const failure = (reason: GeolocationPositionError) => {
      if (token !== generation.current) return;
      if (received && reason.code !== 1) return; // Keep the last successful fix.
      if (reason.code === 1) cancel();
      setLocation(null); setStatus("error");
      setError(reason.code === 1
        ? "Location access was denied. Allow location in your browser's site settings, then retry, or choose a location."
        : reason.code === 3
          ? "Finding your location timed out. Retry near a window or outdoors, or choose a location."
          : "Your location is unavailable. Check location services, retry, or choose a location.");
    };
    try {
      navigator.geolocation.getCurrentPosition(success, failure,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
      // Refine the first network fix with GPS, and follow changes without a picker.
      if (token === generation.current && navigator.geolocation.watchPosition) watch.current = navigator.geolocation.watchPosition(
        success, failure, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
    } catch {
      setStatus("error"); setError("Location could not be started. Check browser permissions and retry.");
    }
  }, [cancel]);
  return { location, status, source, error, accuracy, request, choose, cancel };
}
export type ObserverState = ReturnType<typeof useObserver>;
