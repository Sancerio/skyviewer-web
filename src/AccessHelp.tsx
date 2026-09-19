import { useEffect, useState } from "react";
import { isHomeScreen, isIOS, permissionHint, type PermissionHint } from "./permissions";
const hintText: Record<PermissionHint, string> = {
  granted: "Browser reports allowed", denied: "Off in browser settings",
  prompt: "Your browser may ask", unknown: "Cannot check in advance",
};
export default function AccessHelp() {
  const [hints, setHints] = useState<{ camera: PermissionHint; location: PermissionHint } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([permissionHint("camera"), permissionHint("geolocation")]).then(([camera, location]) => {
      if (!cancelled) setHints({ camera, location });
    });
    return () => { cancelled = true; };
  }, []);
  return <div className="access-help">
    <p>{isIOS() && isHomeScreen()
      ? "You are using the iPhone Home Screen version. iOS may ask for camera, motion or location again after the app is closed. That does not mean your setup was lost."
      : "Your browser decides how long camera, motion and location permissions last. A new launch may need a new approval."}</p>
    <p>SkyViewer remembers your display choices, but cannot save or grant system permissions. It will not open the camera just because you reopen the app.</p>
    <dl className="permission-hints"><div><dt>Camera</dt><dd>{hints ? hintText[hints.camera] : "Checking…"}</dd></div>
      <div><dt>Location</dt><dd>{hints ? hintText[hints.location] : "Checking…"}</dd></div>
      <div><dt>Motion</dt><dd>Checked when you start</dd></div></dl>
    <p className="ar-small">These are browser-reported settings, not a guarantee that the camera or sensors are working. Some browsers cannot report permissions in advance.</p>
    <h3>When access is off</h3>
    <p>{isIOS()
      ? "In Safari, check this site's settings for Camera and Location. For location, also check iPhone Settings → Privacy & Security → Location Services. Safari and Home Screen permissions may be handled separately."
      : "Open this site's permissions in your browser settings and allow the feature you want to use. You do not need to grant access to every website."}</p>
    <p>For motion, use Enable motion or Retry motion here. If no prompt appears and access stays off, check your browser's site permissions or reopen the page in your phone's main browser.</p>
    <h3>Fewer location prompts</h3><p>Save an observing place in Sky display to use that fixed place on future visits without asking for GPS. It is optional, stays on this device, and can be removed there. Use your current location when you travel.</p>
    <h3>Your privacy</h3><p>No microphone, recording or camera uploads. The camera turns off when you stop or leave the app. Saving a place does not save permission to access your location.</p>
    <h3>What you see</h3><p>Stars and planets are calculated markers, not objects recognised in the camera. Clouds, daylight and buildings may hide the real sky. Compass alignment and lens scale are approximate.</p>
    <p className="ar-small">Never aim binoculars or a telescope at the Sun using this app.</p>
  </div>;
}
