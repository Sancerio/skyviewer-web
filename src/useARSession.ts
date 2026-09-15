import { useCallback, useEffect, useRef, useState } from "react";

export type AROrientation = {
  alpha: number;
  beta: number;
  gamma: number;
  absolute: boolean;
  heading?: number;
  accuracy?: number;
};

export type ARSession = {
  status: "idle" | "starting" | "active" | "error";
  error: string;
  orientation: AROrientation | null;
  stream: MediaStream | null;
  cameraPaused: boolean;
  start: () => Promise<void>;
  stop: () => void;
  videoSettings: {
    width: number;
    height: number;
    facingMode?: string;
  } | null;
};

type OrientationEventWithWebKitCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type OrientationEventConstructorWithPermission =
  typeof DeviceOrientationEvent & {
    requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
  };

const SENSOR_STALE_MS = 3_000;
const FRONT_CAMERA_LABEL = /\b(front|user|facetime|selfie)\b/i;

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function errorName(error: unknown) {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return "";
  }
  return typeof error.name === "string" ? error.name : "";
}

function cameraErrorMessage(error: unknown) {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Rear-camera access was denied. Allow camera access and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "A rear camera could not be found on this device.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The rear camera is unavailable, possibly because another app is using it.";
  }
  return "The rear camera could not be started. Check browser permissions and try again.";
}

function orientationErrorMessage(error: unknown) {
  if (errorName(error) === "NotAllowedError") {
    return "Motion and orientation access was denied. Allow motion access and try again.";
  }
  return "Motion and orientation access could not be enabled. Check browser permissions and try again.";
}

export function useARSession(): ARSession {
  const [status, setStatus] = useState<ARSession["status"]>("idle");
  const [error, setError] = useState("");
  const [orientation, setOrientation] = useState<AROrientation | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [videoSettings, setVideoSettings] =
    useState<ARSession["videoSettings"]>(null);

  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionCleanupRef = useRef<() => void>(() => {});
  const sensorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAbsoluteAtRef = useRef(0);

  const clearSensorTimer = useCallback(() => {
    if (sensorTimerRef.current !== null) {
      clearTimeout(sensorTimerRef.current);
      sensorTimerRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    clearSensorTimer();
    sessionCleanupRef.current();
    sessionCleanupRef.current = () => {};
    const currentStream = streamRef.current;
    streamRef.current = null;
    stopTracks(currentStream);
    lastAbsoluteAtRef.current = 0;
  }, [clearSensorTimer]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    clearSession();
    if (!mountedRef.current) return;
    setStatus("idle");
    setError("");
    setOrientation(null);
    setStream(null);
    setCameraPaused(false);
    setVideoSettings(null);
  }, [clearSession]);

  const start = useCallback(async () => {
    if (startingRef.current || streamRef.current) return;

    startingRef.current = true;
    const generation = ++generationRef.current;
    const isCurrent = () =>
      mountedRef.current && generation === generationRef.current;

    setStatus("starting");
    setError("");
    setOrientation(null);
    setStream(null);
    setCameraPaused(false);
    setVideoSettings(null);

    if (!window.isSecureContext) {
      startingRef.current = false;
      setStatus("error");
      setError("Camera AR requires a secure HTTPS connection.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      setStatus("error");
      setError("Camera access is not supported by this browser.");
      return;
    }

    const hasOrientation = "DeviceOrientationEvent" in window;
    let permissionPromise: Promise<PermissionState> | null = null;
    if (hasOrientation) {
      const OrientationEvent =
        DeviceOrientationEvent as OrientationEventConstructorWithPermission;
      try {
        // This call must happen before the first await so iOS retains the
        // transient user activation from the button press.
        permissionPromise = OrientationEvent.requestPermission?.(true) ?? null;
      } catch (permissionError) {
        startingRef.current = false;
        if (!isCurrent()) return;
        setStatus("error");
        setError(orientationErrorMessage(permissionError));
        return;
      }
    }

    if (permissionPromise) {
      try {
        const permission = await permissionPromise;
        if (!isCurrent()) return;
        if (permission !== "granted") {
          startingRef.current = false;
          setStatus("error");
          setError(
            "Motion and orientation access was denied. Allow motion access and try again.",
          );
          return;
        }
      } catch (permissionError) {
        if (!isCurrent()) return;
        startingRef.current = false;
        setStatus("error");
        setError(orientationErrorMessage(permissionError));
        return;
      }
    }

    let cameraStream: MediaStream | null = null;
    try {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: "environment" } },
        });
      } catch (exactError) {
        if (!isCurrent()) return;
        const name = errorName(exactError);
        if (name !== "OverconstrainedError" && name !== "NotFoundError") {
          throw exactError;
        }

        const devices = navigator.mediaDevices.enumerateDevices
          ? await navigator.mediaDevices.enumerateDevices()
          : [];
        if (!isCurrent()) return;
        const rearCamera = devices.find(
          (device) =>
            device.kind === "videoinput" &&
            /back|rear|environment/i.test(device.label),
        );
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: rearCamera
            ? { deviceId: { exact: rearCamera.deviceId } }
            : { facingMode: { ideal: "environment" } },
        });
      }

      if (!isCurrent()) {
        stopTracks(cameraStream);
        return;
      }

      const videoTrack = cameraStream.getVideoTracks()[0];
      if (!videoTrack) {
        stopTracks(cameraStream);
        throw new DOMException("No video track", "NotFoundError");
      }
      const settings = videoTrack.getSettings();
      if (
        (settings.facingMode !== "environment" &&
          !/back|rear|environment/i.test(videoTrack.label)) ||
        settings.facingMode === "user" ||
        FRONT_CAMERA_LABEL.test(videoTrack.label)
      ) {
        stopTracks(cameraStream);
        cameraStream = null;
        throw new DOMException("Front camera selected", "NotFoundError");
      }

      streamRef.current = cameraStream;

      const markSensorStale = () => {
        clearSensorTimer();
        sensorTimerRef.current = setTimeout(() => {
          if (!isCurrent()) return;
          lastAbsoluteAtRef.current = 0;
          setOrientation(null);
          setError(
            "Orientation data is unavailable. Move the phone gently or check motion permissions; labels pause without orientation data.",
          );
        }, SENSOR_STALE_MS);
      };

      const handleOrientation = (event: DeviceOrientationEvent) => {
        if (!isCurrent()) return;
        const compassEvent = event as OrientationEventWithWebKitCompass;
        if (
          event.alpha === null ||
          event.beta === null ||
          event.gamma === null ||
          !Number.isFinite(event.alpha) ||
          !Number.isFinite(event.beta) ||
          !Number.isFinite(event.gamma)
        ) {
          return;
        }

        const heading = Number.isFinite(compassEvent.webkitCompassHeading)
          ? compassEvent.webkitCompassHeading
          : undefined;
        const accuracy = Number.isFinite(compassEvent.webkitCompassAccuracy)
          ? compassEvent.webkitCompassAccuracy
          : undefined;
        const now = Date.now();
        if (event.absolute) lastAbsoluteAtRef.current = now;
        else if (
          heading === undefined &&
          now - lastAbsoluteAtRef.current < SENSOR_STALE_MS
        ) {
          return;
        }

        setOrientation({
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma,
          absolute: event.absolute,
          ...(heading === undefined ? {} : { heading }),
          ...(accuracy === undefined ? {} : { accuracy }),
        });
        setError("");
        markSensorStale();
      };

      const handleTrackEnded = () => {
        if (!isCurrent()) return;
        generationRef.current += 1;
        startingRef.current = false;
        clearSession();
        setStatus("error");
        setError("The rear camera stopped. Start AR again to reconnect it.");
        setOrientation(null);
        setStream(null);
        setCameraPaused(false);
        setVideoSettings(null);
      };

      if (hasOrientation) {
        window.addEventListener("deviceorientation", handleOrientation);
        window.addEventListener("deviceorientationabsolute", handleOrientation);
      }
      const updateCameraPaused = () => {
        if (isCurrent()) setCameraPaused(videoTrack.muted);
      };
      updateCameraPaused();
      videoTrack.addEventListener("mute", updateCameraPaused);
      videoTrack.addEventListener("unmute", updateCameraPaused);
      videoTrack.addEventListener("ended", handleTrackEnded);
      sessionCleanupRef.current = () => {
        window.removeEventListener("deviceorientation", handleOrientation);
        window.removeEventListener(
          "deviceorientationabsolute",
          handleOrientation,
        );
        videoTrack.removeEventListener("ended", handleTrackEnded);
        videoTrack.removeEventListener("mute", updateCameraPaused);
        videoTrack.removeEventListener("unmute", updateCameraPaused);
      };

      markSensorStale();
      startingRef.current = false;
      setStream(cameraStream);
      setVideoSettings({
        width: settings.width ?? 0,
        height: settings.height ?? 0,
        ...(settings.facingMode ? { facingMode: settings.facingMode } : {}),
      });
      setStatus("active");
      if (!hasOrientation) {
        setError(
          "Device orientation is not supported here. Move the phone gently or check motion permissions; labels pause without orientation data.",
        );
      }
    } catch (cameraError) {
      stopTracks(cameraStream);
      if (!isCurrent()) return;
      startingRef.current = false;
      clearSession();
      setStatus("error");
      setError(cameraErrorMessage(cameraError));
      setOrientation(null);
      setStream(null);
      setCameraPaused(false);
      setVideoSettings(null);
    }
  }, [clearSensorTimer, clearSession]);

  useEffect(() => {
    const stopForPageLifecycle = () => stop();
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") stop();
    };

    document.addEventListener("visibilitychange", stopWhenHidden);
    window.addEventListener("pagehide", stopForPageLifecycle);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stopForPageLifecycle);
    };
  }, [stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      startingRef.current = false;
      clearSession();
    };
  }, [clearSession]);

  return {
    status,
    error,
    orientation,
    stream,
    cameraPaused,
    start,
    stop,
    videoSettings,
  };
}

export default useARSession;
