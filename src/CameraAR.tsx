import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Crosshair, CircleHelp, Search, SlidersHorizontal, X } from "lucide-react";
import { Body, Illumination } from "astronomy-engine";
import { getSky, direction } from "./sky";
import { deviceAttitude, effectiveHorizontalFov, projectAR } from "./orientation";
import { wrap180, wrap360 } from "./compass";
import { magneticDeclination } from "./declination";
import { useARSession } from "./useARSession";
import type { ObserverState } from "./useObserver";
import { drawAR } from "./drawAR";
import { matchesObject } from "./search";
import { readPreferences, savePreferences } from "./preferences";
import { issues, type IssueCode } from "./messages";
import Startup from "./Startup";
import AccessHelp from "./AccessHelp";
import ObjectInformation from "./ObjectInformation";
import "./ar.css";

export default function CameraAR({ observer, onChangeLocation }: { observer: ObserverState; onChangeLocation: () => void }) {
  const session = useARSession();
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), startButton = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null), panelReturn = useRef<HTMLElement | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [size, setSize] = useState({ width: 1, height: 1 }), [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [videoReady, setVideoReady] = useState(false), [playbackError, setPlaybackError] = useState(false);
  const [panel, setPanel] = useState<"search" | "display" | "information" | "help" | null>(null);
  const [query, setQuery] = useState(""), [selected, setSelected] = useState<string>();
  const [magnitudeLimit, setMagnitudeLimit] = useState(() => readPreferences().magnitudeLimit);
  const [returning, setReturning] = useState(() => readPreferences().onboarded);
  const [notice, setNotice] = useState("");
  const [mapMode, setMapMode] = useState(false), [view, setView] = useState({ az: 0, alt: 35 });
  const drag = useRef<{ x: number; y: number; az: number; alt: number; moved: boolean } | null>(null);
  const [screenAngle, setScreenAngle] = useState(() => screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
  const { location } = observer;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    startButton.current?.focus(); return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (panel) {
      panelReturn.current = document.activeElement as HTMLElement;
      (panelRef.current?.querySelector("input") ?? panelRef.current?.querySelector("button"))?.focus();
    } else panelReturn.current?.focus();
  }, [panel]);
  useEffect(() => {
    if (session.status === "paused") setPanel(null);
  }, [session.status]);
  useEffect(() => { const tick = setInterval(() => setDate(new Date()), 5000); return () => clearInterval(tick); }, []);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const resize = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) setSize({ width, height }); });
    resize.observe(el); return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setScreenAngle(screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
    screen.orientation?.addEventListener("change", update); window.addEventListener("orientationchange", update);
    return () => { screen.orientation?.removeEventListener("change", update); window.removeEventListener("orientationchange", update); };
  }, []);
  useEffect(() => {
    const el = video.current; if (!el) return;
    let cancelled = false; setVideoReady(false); setVideoSize({ width: 0, height: 0 }); setPlaybackError(false);
    el.srcObject = session.stream;
    if (session.stream) void el.play().catch(() => { if (!cancelled) setPlaybackError(true); });
    return () => { cancelled = true; el.srcObject = null; };
  }, [session.stream]);
  const objects = useMemo(() => location ? getSky(date, location) : [], [date, location]);
  const moonFraction = useMemo(() => Illumination(Body.Moon, date).phase_fraction, [date]);
  const declination = useMemo(() => location ? magneticDeclination(location.latitude, location.longitude, date) : null, [location, date]);
  const o = session.orientation;
  const attitude = useMemo(() => mapMode ? deviceAttitude(wrap360(360 - view.az), 90 + view.alt, 0, 0)
    : o?.absolute ? deviceAttitude(o.alpha, o.beta, o.gamma, screenAngle, declination ?? 0) : null, [mapMode, view, o, screenAngle, declination]);
  const videoWidth = videoSize.width || session.videoSettings?.width || 0, videoHeight = videoSize.height || session.videoSettings?.height || 0;
  const fov = mapMode ? 70 : videoWidth && videoHeight ? effectiveHorizontalFov(65, videoWidth, videoHeight, size.width, size.height) : 40;
  const active = session.status === "active" || mapMode;
  const ready = !!location && !!attitude && (mapMode || (session.status === "active" && videoReady && videoWidth > 0 && !session.cameraPaused && !playbackError));
  useEffect(() => {
    if (ready && !returning) { setReturning(true); savePreferences({ onboarded: true }); }
  }, [ready, returning]);
  const heading = attitude ? wrap360(Math.atan2(attitude.forward[0], attitude.forward[1]) * 180 / Math.PI) : 0;
  const elevation = attitude ? Math.asin(Math.max(-1, Math.min(1, attitude.forward[2]))) * 180 / Math.PI : 0;
  const candidates = useMemo(() => objects.filter(s => s.altitude >= 0 && (s.kind !== "star" || s.magnitude <= magnitudeLimit || s.id === selected)), [objects, magnitudeLimit, selected]);
  const projected = useMemo(() => !ready || !attitude ? [] : candidates.map(object => ({ object, ...projectAR(object.altitude, object.azimuth, attitude, fov, size.width, size.height) })).filter(p => p.visible), [ready, attitude, candidates, fov, size]);
  const nearest = useMemo(() => [...projected].sort((a, b) => Math.hypot(a.x - size.width / 2, a.y - size.height / 2) - Math.hypot(b.x - size.width / 2, b.y - size.height / 2)).slice(0, 3), [projected, size]);
  const chosen = objects.find(s => s.id === selected), sun = objects.find(s => s.kind === "sun");
  const results = useMemo(() => query.trim() ? objects.filter(s => matchesObject(s, query)).slice(0, 40) : objects.filter(s => s.kind !== "star"), [objects, query]);
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext("2d"); if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), width = Math.round(size.width * dpr), height = Math.round(size.height * dpr);
    if (el.width !== width || el.height !== height) { el.width = width; el.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.width, size.height);
    if (ready && attitude) drawAR(ctx, projected, attitude, size.width, size.height, fov, selected, moonFraction, sun);
  }, [ready, attitude, projected, size, fov, selected, moonFraction, sun]);
  function stop() { session.stop(); observer.cancel(); setMapMode(false); setPanel(null); }
  function start() { setMapMode(false); setPanel(null); void session.start(observer.ensure); }
  function reconnect() { session.stop(); start(); }
  function browse() { session.stop(); setMapMode(true); setPanel(null); void observer.ensure(); }
  function pick(id: string) {
    setSelected(id); setPanel(null);
    if (mapMode) { const target = objects.find(s => s.id === id); if (target && target.altitude >= 0) setView({ az: target.azimuth, alt: Math.min(89, target.altitude) }); }
  }
  function updateVideoSize() {
    const el = video.current; if (!el) return;
    setVideoSize({ width: el.videoWidth, height: el.videoHeight }); if (el.readyState >= 2 && !el.paused) setVideoReady(true);
  }
  function resumePreview() {
    const el = video.current, stream = session.stream; if (!el || !stream) return;
    setPlaybackError(false);
    void el.play().catch(() => { if (el.srcObject === stream) setPlaybackError(true); });
  }
  const problem: IssueCode | null = observer.issue ?? (!mapMode ? playbackError ? "playback" : session.issue ?? (o && !o.absolute ? "compass-missing" : null) : null);
  const stage = !location ? "Finding your sky…" : !mapMode && session.cameraPaused ? "Camera paused"
    : problem ? issues[problem].title : !ready ? "Connecting your sky…" : `${direction(heading)} ${Math.round(heading) % 360}° · altitude ${Math.round(elevation)}°`;
  const waiting = !location ? "Finding your location. Your sky appears as soon as we have a place."
    : !mapMode && session.cameraPaused ? "Your phone paused the camera. It will resume when the camera is available."
    : !mapMode && !o ? "Connecting to your phone's motion sensors…" : !ready ? "Starting the camera preview…" : "";
  function recover(code: IssueCode) {
    if (code.startsWith("location")) void observer.request();
    else if (code === "motion-denied" || code === "motion-missing" || code === "compass-missing") void session.retryMotion();
    else if (code === "playback") resumePreview(); else reconnect();
  }
  let targetHint = "";
  if (chosen) {
    if (chosen.altitude < 0) targetHint = `${chosen.name} is below your horizon right now. Try another target.`;
    else if (!ready) targetHint = `Getting ready to guide you to ${chosen.name}.`;
    else if (projected.some(p => p.object.id === chosen.id)) targetHint = `${chosen.name} is in your view. Tap Information to learn more.`;
    else { const az = wrap180(chosen.azimuth - heading), alt = chosen.altitude - elevation;
      targetHint = `Find ${chosen.name}: ${Math.abs(az) > 5 ? `turn ${az > 0 ? "right" : "left"} ${Math.round(Math.abs(az))}°` : "keep this direction"}${Math.abs(alt) > 5 ? `, tilt ${alt > 0 ? "up" : "down"} ${Math.round(Math.abs(alt))}°` : ""}.`; }
  }
  return <section className={`ar-view${mapMode ? " ar-map-mode" : ""}`} role="dialog" aria-modal="true" aria-label="Camera AR"
    data-ready={ready} data-declination={declination ?? "unavailable"} data-mode={mapMode ? "map" : "ar"} data-rendered-objects={projected.length}
    onKeyDown={e => {
      if (e.key === "Escape") { if (panel) setPanel(null); else stop(); }
      if (e.key === "Tab") {
        const root = panelRef.current ?? e.currentTarget;
        const controls = Array.from(root.querySelectorAll<HTMLElement>("button,input,a[href],canvas[tabindex='0']")).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
    <video ref={video} autoPlay muted playsInline className="ar-video" aria-label="Live rear camera" aria-hidden={!active || mapMode}
      onPlaying={() => { updateVideoSize(); setVideoReady(true); setPlaybackError(false); }} onLoadedData={updateVideoSize} onLoadedMetadata={updateVideoSize} onResize={updateVideoSize}
      onWaiting={() => setVideoReady(false)} onError={() => { setVideoReady(false); if (session.stream) setPlaybackError(true); }} />
    <canvas ref={canvas} className="ar-canvas" aria-label={mapMode ? "Sky map: drag or use arrow keys to explore" : "Star and planet labels projected over the camera"}
      tabIndex={mapMode ? 0 : -1} onKeyDown={e => {
        if (!mapMode || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault(); setView(v => ({ az: wrap360(v.az + (e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0)), alt: Math.max(-30, Math.min(89, v.alt + (e.key === "ArrowUp" ? 5 : e.key === "ArrowDown" ? -5 : 0))) }));
      }} onPointerDown={e => { if (mapMode) { drag.current = { x: e.clientX, y: e.clientY, az: view.az, alt: view.alt, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); } }}
      onPointerMove={e => { if (!drag.current || !mapMode) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
        setView({ az: wrap360(drag.current.az - dx * 70 / size.width), alt: Math.max(-30, Math.min(89, drag.current.alt + dy * 70 / size.width)) });
      }} onPointerCancel={() => { drag.current = null; }} onPointerUp={e => {
        const moved = drag.current?.moved; drag.current = null; if (!ready || moved || panel) return;
        const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
        const hit = [...projected].filter(p => Math.hypot(p.x - x, p.y - y) < 28).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (hit) { setSelected(hit.object.id); setPanel("information"); }
      }} />
    <header className="ar-header"><span><Camera size={19} /><strong>{mapMode ? "Sky map" : "SkyViewer"}</strong>
      <small>{mapMode ? "DRAG TO EXPLORE" : session.cameraPaused ? "CAMERA PAUSED" : session.status === "active" && videoReady && !playbackError ? "LIVE" : "LOOK UP"}</small></span>
      {(active || session.status === "starting") && <button className="ar-icon" aria-label="Close camera AR" onClick={stop}><X /></button>}</header>
    {!active && !panel && <Startup session={session} observer={observer} returning={returning} startButton={startButton}
      onStart={start} onStop={stop} onBrowse={browse} onHelp={() => setPanel("help")} onChangeLocation={onChangeLocation} />}
    {active && <>
      <div className="ar-status"><span>{stage}</span><span>{location?.name ?? "Location"} · {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)}
        {observer.source === "saved" ? " · Saved place, not live GPS" : observer.source === "manual" ? " · Chosen place" : observer.fixAt ? ` · Fix ${Math.max(0, Math.floor((date.getTime() - observer.fixAt) / 60000))} min ago` : ""}</span></div>
      <div className="ar-reticle" aria-hidden="true"><Crosshair size={38} /></div>
      {!panel && (problem || waiting) ? <div className="ar-callout" role="status" aria-live="polite">
        <strong>{problem ? issues[problem].title : "Getting your sky ready"}</strong><p>{problem ? issues[problem].detail : waiting}</p>
        {problem && <button onClick={() => recover(problem)}>{issues[problem].action}</button>}
        {!location && observer.status !== "loading" && <button onClick={onChangeLocation}>Choose a location</button>}
        {(problem || session.cameraPaused) && <button onClick={() => setPanel("help")}>Help with access</button>}
        {problem && !mapMode && <button onClick={browse}>Explore without camera</button>}
      </div> : !panel && <div className="ar-accuracy">{mapMode ? "Sky map · drag to explore, not camera-aligned" : "Following your phone · alignment is approximate"}
        {!mapMode && o?.accuracy !== undefined && o.accuracy > 25 ? " · Compass accuracy is low; move away from metal" : ""}
        {!mapMode && declination === null ? " · True-north correction unavailable" : ""}
        {ready && elevation < 0 ? " · Point above the horizon" : ""}{ready && sun && sun.altitude > -6 ? " · Daylight may hide the real stars" : ""}</div>}
      {!panel && <div className="ar-actions"><button className="ar-icon" aria-label="Search in camera AR" onClick={() => setPanel("search")}><Search /></button>
        <button className="ar-icon" aria-label="Sky display settings" onClick={() => setPanel("display")}><SlidersHorizontal /></button>
        <button className="ar-icon" aria-label="Help with access" onClick={() => setPanel("help")}><CircleHelp /></button></div>}
      {!panel && <div className="ar-bottom">{chosen ? <><p>{targetHint}</p><div className="ar-target"><span><strong>{chosen.name}</strong><small>{chosen.constellation || chosen.kind} · magnitude {chosen.magnitude.toFixed(1)}</small></span>
        <button onClick={() => setPanel("information")}>Information ↗</button><button className="ar-icon" aria-label="Clear AR target" onClick={() => setSelected(undefined)}><X size={16} /></button></div></>
        : <><span className="eyebrow">{ready ? `${projected.length} OBJECTS IN THIS DIRECTION` : "YOUR SKY"}</span><div className="ar-nearby">{nearest.length ? nearest.map(({ object: s }) => <button key={s.id} onClick={() => { setSelected(s.id); setPanel("information"); }}>{s.name}<small>{s.kind}</small></button>)
          : <p>{ready ? elevation < 0 ? "Point up to see the sky above your horizon." : "No objects in this view. Turn slowly, or search for a star or planet." : "Your sky will appear here when connected."}</p>}</div></>}</div>}
      <button className="ar-stop" onClick={stop}>{mapMode ? "Close sky map" : "Stop camera"}</button>
    </>}
    {panel && <div ref={panelRef} className={`ar-sheet${!active ? " setup-help" : ""}`} role="region" aria-label={panel === "help" ? "Access help" : "Sky controls"}>
      <div className="ar-sheet-title"><h2>{panel === "help" ? "Help with access" : panel === "search" ? "Find in the sky" : panel === "display" ? "Sky display" : chosen?.name}</h2>
        <button className="ar-icon" aria-label={panel === "help" ? "Close help" : panel === "search" ? "Close AR search" : panel === "information" ? "Close AR information" : "Close display settings"} onClick={() => setPanel(null)}><X size={19} /></button></div>
      {panel === "help" && <><AccessHelp />{session.status === "active" && <button className="secondary-button" onClick={reconnect}>Reconnect camera</button>}
        <button className="secondary-button" onClick={browse}>Explore without camera</button></>}
      {panel === "search" && <><input className="ar-search" aria-label="Search AR objects" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try Moon, Saturn or Sirius" />
        <p className="ar-small">Search stars, planets or constellations. ↑ Above your horizon · ↓ Below it.</p><div className="ar-results">{results.map(s => <button key={s.id} onClick={() => pick(s.id)}><span>{s.name}<small>{s.constellation || s.kind}</small></span><span>{Math.round(s.altitude)}° {s.altitude >= 0 ? "↑" : "↓"}</span></button>)}
          {!results.length && <p>{location ? "Nothing matched. Try a star or planet name, such as Moon or Sirius." : "Choose a place first to search its sky."}</p>}</div></>}
      {panel === "display" && <>
        <label>Show fainter stars <strong>magnitude {magnitudeLimit}</strong><input aria-label="Faintest AR stars" type="range" min="0" max="6" step="0.5" value={magnitudeLimit} onChange={e => {
          const value = Number(e.target.value); setMagnitudeLimit(value); if (!savePreferences({ magnitudeLimit: value })) setNotice("This browser could not save your preference. It still works for this visit.");
        }} /></label><p className="ar-small">Higher numbers add more stars. Markers are enlarged so they are easier to see.</p>
        <h3>Your observing place</h3><p>{observer.source === "saved" ? "Using your saved place, not a new GPS fix. Somewhere new? Update your location below." : "Save this fixed place to skip GPS requests on future visits. This stores rounded coordinates on this device only."}</p>
        <button className="secondary-button" disabled={!location} onClick={() => setNotice(observer.remember() ? "Observing place saved on this device. Future visits use this fixed place until you change it." : "This browser could not save the place. You can still use it for this visit.")}>Save observing place</button>
        {observer.savedPlace && <button className="secondary-button" onClick={() => setNotice(observer.forgetPlace() ? "Saved place removed from this device." : "The saved place could not be removed. Check browser storage settings.")}>Forget saved place</button>}
        <button className="secondary-button" disabled={observer.status === "loading"} onClick={() => { void observer.request(); }}>{observer.status === "loading" ? "Updating location…" : "Use current location"}</button>
        <button className="secondary-button" onClick={onChangeLocation}>Change observing location</button>
        {observer.error && <p role="alert" className="ar-error">{observer.error}</p>}
        {notice && <p role="status">{notice}</p>}
        <p className="ar-small">Your phone handles alignment. Nearby metal and magnetic accessories can make it less accurate. No manual calibration is required by SkyViewer.</p>
        <button className="secondary-button" onClick={mapMode ? start : browse}>{mapMode ? "Open camera" : "Explore without camera"}</button>
      </>}
      {panel === "information" && chosen && <ObjectInformation object={chosen} />}
    </div>}
  </section>;
}
