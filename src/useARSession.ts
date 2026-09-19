import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeOrientation, type OrientationReading, type OrientationSample } from "./compass";
export type AROrientation = OrientationSample;
export type ARSession = {
  status: "idle" | "starting" | "active" | "error";
  error: string;
  orientation: AROrientation | null;
  stream: MediaStream | null;
  cameraPaused: boolean;
  start: () => Promise<void>;
  stop: () => void;
  videoSettings: { width: number; height: number; facingMode?: string } | null;
};
const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach(t => t.stop());
const errorName = (e: unknown) => e && typeof e === "object" && "name" in e ? String(e.name) : "";
export function useARSession(): ARSession {
  const [status, setStatus] = useState<ARSession["status"]>("idle");
  const [error, setError] = useState("");
  const [orientation, setOrientation] = useState<AROrientation | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [videoSettings, setVideoSettings] = useState<ARSession["videoSettings"]>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const busy = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const clear = useCallback(() => {
    cleanup.current(); cleanup.current = () => {};
    stopTracks(streamRef.current); streamRef.current = null;
  }, []);
  const stop = useCallback(() => {
    generation.current++; busy.current = false; clear();
    if (!mounted.current) return;
    setStatus("idle"); setError(""); setOrientation(null); setStream(null);
    setCameraPaused(false); setVideoSettings(null);
  }, [clear]);
  const start = useCallback(async () => {
    if (busy.current || streamRef.current) return;
    clear(); busy.current = true;
    const token = ++generation.current;
    const current = () => mounted.current && generation.current === token;
    const fail = (message: string) => {
      if (!current()) return;
      clear(); busy.current = false;
      setError(message); setStatus("error"); setOrientation(null);
      setStream(null); setVideoSettings(null); setCameraPaused(false);
    };
    setStatus("starting"); setError(""); setOrientation(null);
    if (!window.isSecureContext) { fail("Camera AR requires a secure HTTPS connection."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { fail("Camera access is not supported by this browser. Use the sky map instead."); return; }
    const hasOrientation = "DeviceOrientationEvent" in window;
    let permission: Promise<PermissionState> | undefined;
    try {
      // Must run in the original click stack, BEFORE any camera/GPS await.
      const Constructor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
      };
      permission = hasOrientation ? Constructor.requestPermission?.(true) : undefined;
    } catch { fail("Motion and orientation access could not be enabled. Open in Safari or Chrome and retry."); return; }
    let initialTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let pending: AROrientation | null = null;
    let hasSample = false;
    let lastNorth = -Infinity;
    const handleOrientation = (event: Event) => {
      if (!current()) return;
      const sample = normalizeOrientation(event as unknown as OrientationReading);
      if (!sample) return;
      const now = performance.now();
      if (!sample.absolute && now - lastNorth < 1500) return;
      if (sample.absolute) lastNorth = now;
      hasSample = true; clearTimeout(initialTimer);
      pending = sample;
      // Coalesce high-rate sensor events, not full React/canvas redraws per event.
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (current()) { setOrientation(pending); setError(""); }
      });
    };
    // Listen before waiting for the camera: some devices send just one initial pose.
    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    const sensorCleanup = () => {
      clearTimeout(initialTimer); cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
    };
    cleanup.current = sensorCleanup;
    if (permission) {
      try {
        if (await permission !== "granted") {
          fail("Motion and orientation access was denied. Allow motion access and try again, or use the sky map."); return;
        }
      } catch { fail("Motion and orientation access was denied. Check browser site settings and retry."); return; }
      if (!current()) return;
    }
    let camera: MediaStream | null = null;
    try {
      try {
        camera = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: { exact: "environment" } } });
      } catch (e) {
        if (!current()) return;
        if (!["OverconstrainedError", "NotFoundError"].includes(errorName(e))) throw e;
        const devices = await navigator.mediaDevices.enumerateDevices?.() ?? [];
        if (!current()) return;
        const rear = devices.find(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label) && !/ultra|tele|depth/i.test(d.label));
        camera = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: rear ? { deviceId: { exact: rear.deviceId } } : { facingMode: { ideal: "environment" } } });
      }
      if (!current()) { stopTracks(camera); return; }
      const track = camera.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (!track || !settings || settings.facingMode === "user" || /\b(front|user|facetime|selfie)\b/i.test(track.label) ||
          (settings.facingMode !== "environment" && !/back|rear|environment/i.test(track.label))) {
        throw new DOMException("Rear camera could not be verified", "NotFoundError");
      }
      streamRef.current = camera;
      const paused = () => { if (current()) setCameraPaused(track.muted); };
      const ended = () => fail("The rear camera stopped. Start AR again to reconnect it.");
      track.addEventListener("mute", paused); track.addEventListener("unmute", paused); track.addEventListener("ended", ended);
      cleanup.current = () => { sensorCleanup(); track.removeEventListener("mute", paused);
        track.removeEventListener("unmute", paused); track.removeEventListener("ended", ended); };
      paused(); busy.current = false; setStream(camera);
      setVideoSettings({ width: settings.width ?? 0, height: settings.height ?? 0, facingMode: settings.facingMode });
      setStatus("active");
      // Event silence is legal when stationary. Time out only the FIRST sample,
      // never erase a valid attitude merely because the phone stopped moving.
      if (!hasSample) initialTimer = setTimeout(() => {
        if (current() && !hasSample) setError(hasOrientation
          ? "No motion data arrived. Check motion permissions or use the sky map."
          : "This device has no orientation sensor. Use the sky map to explore.");
      }, 8000);
    } catch (e) {
      if (camera !== streamRef.current) stopTracks(camera);
      const name = errorName(e);
      fail(name === "NotAllowedError" || name === "SecurityError"
        ? "Rear-camera access was denied. Allow camera access and try again."
        : name === "NotFoundError" || name === "OverconstrainedError"
          ? "A rear camera could not be found on this device. Use the sky map instead."
          : "The rear camera is unavailable, possibly because another app is using it. Retry or use the sky map.");
    }
  }, [clear]);
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { mounted.current = false; generation.current++; busy.current = false; clear();
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); };
  }, [clear, stop]);
  return { status, error, orientation, stream, cameraPaused, start, stop, videoSettings };
}
export default useARSession;
