/** Recovery copy is structured: explain what happened, then one useful action. */
export type IssueCode = "secure" | "camera-unsupported" | "camera-denied" | "camera-missing" | "camera-busy" | "camera-ended" | "motion-denied" | "motion-missing" | "compass-missing" | "location-denied" | "location-timeout" | "location-missing" | "playback";
export type Issue = { title: string; detail: string; action: string };
export const issues: Record<IssueCode, Issue> = {
  secure: { title: "Open the secure version", detail: "Camera and location need an HTTPS connection. Open SkyViewer from its secure web address.", action: "Check connection" },
  "camera-unsupported": { title: "Camera view is not available here", detail: "This browser cannot open the camera. Try your phone's main browser, or explore the sky map without a camera.", action: "Try camera again" },
  "camera-denied": { title: "Camera access is off", detail: "Allow this site to use the camera in your browser settings, then try again. The sky map works without it.", action: "Try camera again" },
  "camera-missing": { title: "No rear camera found", detail: "SkyViewer needs a rear camera for camera view. You can still search and explore in the sky map.", action: "Try camera again" },
  "camera-busy": { title: "The camera could not start", detail: "Another app may be using it. Close other camera apps, return here, and try again.", action: "Try camera again" },
  "camera-ended": { title: "The camera was interrupted", detail: "Your place and display settings are still here. Tap below to reconnect the camera.", action: "Reconnect camera" },
  "motion-denied": { title: "Motion access is off", detail: "SkyViewer uses motion to follow where you point. Try again and allow Motion & Orientation if your phone asks, or use the sky map.", action: "Enable motion" },
  "motion-missing": { title: "We are not receiving motion yet", detail: "Move your phone gently. If nothing changes, retry motion access or use the sky map.", action: "Retry motion" },
  "compass-missing": { title: "We cannot find north yet", detail: "Your phone is sending movement but no reliable compass direction. Move away from metal or magnetic accessories. The sky map does not need a compass.", action: "Retry motion" },
  "location-denied": { title: "Location access is off", detail: "Allow location for this site and try again, or choose an observing place. We will not guess where you are.", action: "Try location again" },
  "location-timeout": { title: "Your location is taking longer than usual", detail: "Try near a window or outdoors, or choose an observing place. Your camera does not need to restart.", action: "Try location again" },
  "location-missing": { title: "We could not find your location", detail: "Check that Location Services are on, then try again. Choosing a city also works.", action: "Try location again" },
  playback: { title: "The camera preview is paused", detail: "Tap Resume preview to keep using this camera. If it stays blank, reconnect the camera from Help.", action: "Resume preview" },
};
export function issueText(code: IssueCode): string { return `${issues[code].title}. ${issues[code].detail}`; }
