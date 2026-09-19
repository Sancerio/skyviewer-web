import type { RefObject } from "react";
import { Camera, MapPin } from "lucide-react";
import type { ARSession } from "./useARSession";
import type { ObserverState } from "./useObserver";
import { isHomeScreen, isIOS } from "./permissions";
import { issues } from "./messages";
export default function Startup({ session, observer, returning, startButton, onStart, onStop, onBrowse, onHelp, onChangeLocation }: {
  session: ARSession; observer: ObserverState; returning: boolean;
  startButton: RefObject<HTMLButtonElement | null>;
  onStart: () => void; onStop: () => void; onBrowse: () => void; onHelp: () => void; onChangeLocation: () => void;
}) {
  const starting = session.status === "starting", paused = session.status === "paused";
  const issue = session.issue ?? observer.issue;
  const phaseText = { idle: "Ready when you are", motion: "Enabling motion…", location: "Finding your location…", camera: "Opening camera…" };
  const location = observer.location;
  return <div className="ar-setup">
    <div className="modal-illustration"><Camera size={26} /></div>
    <span className="eyebrow">{paused ? "YOUR SESSION IS PAUSED" : returning ? "WELCOME BACK" : "YOUR SKY, EXPLAINED"}</span>
    <h2>{paused ? "Ready to look up again?" : returning ? "Your sky is waiting." : <>Point your phone.<br />Discover your sky.</>}</h2>
    <p>{paused ? "We turned the camera off while you were away. Your place and display choices are still here. Tap once to resume."
      : returning ? "Open the camera and point at the sky. We will check only what this session needs."
      : "Find stars, the Moon and planets as you turn your phone. Your phone handles alignment—no manual calibration."}</p>
    <div className="ar-location"><MapPin size={18} /><span><strong>{location?.name ?? "Use your current location"}</strong>
      <small>{location ? `${location.latitude.toFixed(3)}°, ${location.longitude.toFixed(3)}° · ${observer.source === "saved" ? "Saved place, not live GPS" : observer.source === "manual" ? "Chosen place" : "Latest location fix"}` : "Only requested when you start"}</small></span>
      <button onClick={onChangeLocation} disabled={starting}>Change</button></div>
    {!returning && !paused && !starting && <p className="ar-small">On your first visit, your phone may ask for Motion & Orientation, Location and Camera. Each helps place the right sky over your view. No microphone is needed.</p>}
    {starting && <div className="startup-progress" role="status" aria-live="polite"><strong>{phaseText[session.phase]}</strong>
      <p>{session.phase === "motion" ? "Allow Motion & Orientation if your phone asks." : session.phase === "location" ? "Allow location if asked. A city or saved place works too." : "Allow the rear camera if asked. Nothing is recorded."}</p>
      <ol aria-label="Setup progress">{(["motion", "location", "camera"] as const).map((phase, i) => {
        const step = ["motion", "location", "camera"].indexOf(session.phase);
        return <li key={phase} aria-current={phase === session.phase ? "step" : undefined} data-complete={i < step}>{["Motion", "Location", "Camera"][i]}{i < step ? " ✓" : ""}</li>;
      })}</ol></div>}
    {issue && !starting && <div className="access-issue" role="alert"><strong>{issues[issue].title}</strong><p>{issues[issue].detail}</p></div>}
    <button ref={startButton} className="primary-button" disabled={starting} onClick={onStart}>
      {starting ? phaseText[session.phase] : issue ? issues[issue].action : paused ? "Resume stargazing" : returning ? "Open camera" : "Start stargazing"}</button>
    {starting ? <button className="secondary-button" onClick={onStop}>Cancel setup</button> : <>
      <button className="secondary-button" onClick={onBrowse}>Explore without camera</button>
      <button className="text-button access-help-button" onClick={onHelp}>Help with access</button>
      {isIOS() && isHomeScreen() && <p className="ar-small">iOS may ask again after a new launch. Your display settings are remembered; system permissions are controlled by iOS.</p>}
    </>}
    <p className="ar-small">Your camera stays on this device. No recording or uploads.</p>
    <p className="ar-small"><a href="https://github.com/Sancerio/skyviewer-web" target="_blank" rel="noreferrer">Open source</a>{" · "}<a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Data &amp; licenses</a></p>
  </div>;
}
