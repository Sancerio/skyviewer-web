import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeOrientation, type OrientationReading, type OrientationSample } from "./compass";
import { motionPermission, requestMotion } from "./permissions";
import { issueText, type IssueCode } from "./messages";
export type AROrientation = OrientationSample;
export type ARSession = {
  status: "idle" | "starting" | "active" | "paused" | "error";
  phase: "idle" | "motion" | "location" | "camera";
  error: string; issue: IssueCode | null;
  orientation: AROrientation | null; stream: MediaStream | null; cameraPaused: boolean;
  start: (prepare?: () => Promise<boolean>) => Promise<void>;
  retryMotion: () => Promise<void>; stop: () => void;
  videoSettings: { width: number; height: number; facingMode?: string } | null;
};
const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach(t => t.stop());
const errorName = (e: unknown) => e && typeof e === "object" && "name" in e ? String(e.name) : "";
export function useARSession(): ARSession {
  const [status, setStatus] = useState<ARSession["status"]>("idle");
  const statusRef = useRef(status); statusRef.current = status;
  const [phase, setPhase] = useState<ARSession["phase"]>("idle");
  const [issue, setIssue] = useState<IssueCode | null>(null);
  const [orientation, setOrientation] = useState<AROrientation | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [videoSettings, setVideoSettings] = useState<ARSession["videoSettings"]>(null);
  const mounted = useRef(true), generation = useRef(0), busy = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRetryBusy = useRef(false);
  const sampleRevision = useRef(0);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current); timer.current = null;
    cleanup.current(); cleanup.current = () => {};
    stopTracks(streamRef.current); streamRef.current = null;
  }, []);
  const reset = useCallback((next: "idle" | "paused") => {
    generation.current++; busy.current = false; motionRetryBusy.current = false; clear();
    if (!mounted.current) return;
    statusRef.current = next; setStatus(next); setPhase("idle"); setIssue(null);
    setOrientation(null); setStream(null); setCameraPaused(false); setVideoSettings(null);
  }, [clear]);
  const stop = useCallback(() => reset("idle"), [reset]);
  const awaitSensors = useCallback((token: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (mounted.current && token === generation.current) {
        // Revalidate on the next explicit retry. Never persist or assume a grant.
        motionPermission.invalidate(); setIssue("motion-missing"); setOrientation(null);
      }
    }, 8000);
  }, []);
  const retryMotion = useCallback(async () => {
    if (!streamRef.current || motionRetryBusy.current) return;
    motionRetryBusy.current = true;
    const token = generation.current, revision = sampleRevision.current;
    // A previous timer must not invalidate the grant while its new prompt is open.
    if (timer.current) clearTimeout(timer.current); timer.current = null;
    motionPermission.invalidate(); setIssue(null); setOrientation(null);
    try {
      const result = await requestMotion(); // request runs in this click stack.
      if (!mounted.current || token !== generation.current) return;
      if (result !== "granted") { setIssue("motion-denied"); setOrientation(null); }
      // The browser can deliver a pose before its permission promise settles.
      // Do not time out that valid stationary pose eight seconds later.
      else if (sampleRevision.current === revision) awaitSensors(token);
    } catch {
      if (mounted.current && token === generation.current) { setIssue("motion-denied"); setOrientation(null); }
    } finally { if (token === generation.current) motionRetryBusy.current = false; }
  }, [awaitSensors]);
  const start = useCallback(async (prepare?: () => Promise<boolean>) => {
    if (busy.current || streamRef.current) return;
    clear(); busy.current = true;
    const token = ++generation.current;
    const current = () => mounted.current && generation.current === token;
    const fail = (code: IssueCode) => {
      if (!current()) return;
      clear(); busy.current = false; setIssue(code); setPhase("idle"); setStatus("error");
      statusRef.current = "error"; setOrientation(null); setStream(null); setVideoSettings(null); setCameraPaused(false);
    };
    setStatus("starting"); statusRef.current = "starting"; setIssue(null); setOrientation(null);
    if (!window.isSecureContext) { fail("secure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { fail("camera-unsupported"); return; }
    // First request before any await; later starts reuse only the live-document grant.
    setPhase("motion");
    const permission = requestMotion();
    let frame = 0, hasSample = false, lastNorth = -Infinity;
    let pending: AROrientation | null = null;
    const handleOrientation = (event: Event) => {
      if (!current()) return;
      const sample = normalizeOrientation(event as unknown as OrientationReading);
      if (!sample) return;
      const now = performance.now();
      if (!sample.absolute && now - lastNorth < 1500) return;
      if (sample.absolute) lastNorth = now;
      hasSample = true; sampleRevision.current++;
      if (timer.current) clearTimeout(timer.current); timer.current = null;
      pending = sample;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (current()) { setOrientation(pending); setIssue(null); }
      });
    };
    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    const sensorCleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
    };
    cleanup.current = sensorCleanup;
    try {
      const result = await permission;
      if (!current()) return;
      if (result !== "granted") { fail("motion-denied"); return; }
    } catch { fail("motion-denied"); return; }
    // Sequence prompts. A denied motion/location request never opens a camera.
    if (prepare) {
      setPhase("location");
      let located = false;
      try { located = await prepare(); } catch { /* Observer owns location copy. */ }
      if (!current()) return;
      if (!located) { reset("idle"); return; }
    }
    setPhase("camera");
    let camera: MediaStream | null = null;
    try {
      try {
        camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "environment" } } });
      } catch (e) {
        if (!current()) return;
        if (!["OverconstrainedError", "NotFoundError"].includes(errorName(e))) throw e;
        const devices = await navigator.mediaDevices.enumerateDevices?.() ?? [];
        if (!current()) return;
        const rear = devices.find(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label) && !/ultra|tele|depth/i.test(d.label));
        camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: rear ? { deviceId: { exact: rear.deviceId } } : { facingMode: { ideal: "environment" } } });
      }
      if (!current()) { stopTracks(camera); return; }
      const track = camera.getVideoTracks()[0], settings = track?.getSettings();
      if (!track || !settings || settings.facingMode === "user" || /\b(front|user|facetime|selfie)\b/i.test(track.label) ||
        (settings.facingMode !== "environment" && !/back|rear|environment/i.test(track.label))) throw new DOMException("Rear camera not found", "NotFoundError");
      streamRef.current = camera;
      const paused = () => { if (current()) setCameraPaused(track.muted); };
      const ended = () => fail("camera-ended");
      track.addEventListener("mute", paused); track.addEventListener("unmute", paused); track.addEventListener("ended", ended);
      cleanup.current = () => { sensorCleanup(); track.removeEventListener("mute", paused); track.removeEventListener("unmute", paused); track.removeEventListener("ended", ended); };
      paused(); busy.current = false; setStream(camera); setVideoSettings({ width: settings.width ?? 0, height: settings.height ?? 0, facingMode: settings.facingMode });
      setStatus("active"); statusRef.current = "active"; setPhase("idle");
      if (!hasSample) awaitSensors(token);
    } catch (e) {
      if (camera !== streamRef.current) stopTracks(camera);
      const name = errorName(e);
      fail(name === "NotAllowedError" || name === "SecurityError" ? "camera-denied" :
        name === "NotFoundError" || name === "OverconstrainedError" ? "camera-missing" : "camera-busy");
    }
  }, [clear, reset, awaitSensors]);
  useEffect(() => {
    mounted.current = true;
    const pause = () => { if (statusRef.current === "active" || statusRef.current === "starting") reset("paused"); };
    const hide = () => { if (document.visibilityState === "hidden") pause(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", pause);
    return () => { mounted.current = false; generation.current++; busy.current = false; clear();
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", pause); };
  }, [clear, reset]);
  return { status, phase, issue, error: issue ? issueText(issue) : "", orientation, stream, cameraPaused, start, retryMotion, stop, videoSettings };
}
export default useARSession;
