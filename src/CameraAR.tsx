import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Crosshair, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { Body, Illumination } from "astronomy-engine";
import { getSky, direction } from "./sky";
import { deviceAttitude, effectiveHorizontalFov, projectAR } from "./orientation";
import { wrap180, wrap360 } from "./compass";
import { magneticDeclination } from "./declination";
import { useARSession } from "./useARSession";
import type { ObserverState } from "./useObserver";
import { drawAR } from "./drawAR";
import { matchesObject } from "./search";
import ObjectInformation from "./ObjectInformation";
import "./ar.css";

export default function CameraAR({ observer, onChangeLocation }: {
  observer: ObserverState;
  onChangeLocation: () => void;
}) {
  const session = useARSession();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [date, setDate] = useState(() => new Date());
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [videoReady, setVideoReady] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [panel, setPanel] = useState<"search" | "display" | "information" | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const [magnitudeLimit, setMagnitudeLimit] = useState(6);
  const [mapMode, setMapMode] = useState(false);
  const [view, setView] = useState({ az: 0, alt: 35 });
  const drag = useRef<{ x: number; y: number; az: number; alt: number; moved: boolean } | null>(null);
  const [screenAngle, setScreenAngle] = useState(() => screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
  const { location } = observer;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    startButton.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setDate(new Date()), 5000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    resize.observe(el); return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setScreenAngle(screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
    screen.orientation?.addEventListener("change", update); window.addEventListener("orientationchange", update);
    return () => { screen.orientation?.removeEventListener("change", update); window.removeEventListener("orientationchange", update); };
  }, []);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let cancelled = false;
    setVideoReady(false); setVideoSize({ width: 0, height: 0 }); setPlaybackError("");
    el.srcObject = session.stream;
    if (session.stream) void el.play().catch(() => {
      if (!cancelled) setPlaybackError("The camera could not play. Retry the camera or use the sky map.");
    });
    return () => { cancelled = true; el.srcObject = null; };
  }, [session.stream]);
  const objects = useMemo(() => location ? getSky(date, location) : [], [date, location]);
  const moonFraction = useMemo(() => Illumination(Body.Moon, date).phase_fraction, [date]);
  const declination = useMemo(() => location ? magneticDeclination(location.latitude, location.longitude, date) : null, [location, date]);
  const o = session.orientation;
  const attitude = useMemo(() => mapMode
    ? deviceAttitude(wrap360(360 - view.az), 90 + view.alt, 0, 0)
    : o?.absolute ? deviceAttitude(o.alpha, o.beta, o.gamma, screenAngle, declination ?? 0) : null,
  [mapMode, view, o, screenAngle, declination]);
  const videoWidth = videoSize.width || session.videoSettings?.width || 0;
  const videoHeight = videoSize.height || session.videoSettings?.height || 0;
  // Web camera APIs do not expose calibrated lens intrinsics. Use a standard
  // rear-lens estimate and account for both screen rotation and cover cropping.
  const fov = mapMode ? 70 : videoWidth && videoHeight
    ? effectiveHorizontalFov(65, videoWidth, videoHeight, size.width, size.height) : 40;
  const active = session.status === "active" || mapMode;
  const ready = !!location && !!attitude && (mapMode ||
    (session.status === "active" && videoReady && videoWidth > 0 && !session.cameraPaused && !playbackError));
  const heading = attitude ? wrap360(Math.atan2(attitude.forward[0], attitude.forward[1]) * 180 / Math.PI) : 0;
  const elevation = attitude ? Math.asin(Math.max(-1, Math.min(1, attitude.forward[2]))) * 180 / Math.PI : 0;
  const candidates = useMemo(() => objects.filter(s => s.altitude >= 0 &&
    (s.kind !== "star" || s.magnitude <= magnitudeLimit || s.id === selected)), [objects, magnitudeLimit, selected]);
  const projected = useMemo(() => !ready || !attitude ? [] : candidates.map(object => ({ object,
    ...projectAR(object.altitude, object.azimuth, attitude, fov, size.width, size.height) })).filter(p => p.visible),
  [ready, attitude, candidates, fov, size]);
  const nearest = useMemo(() => [...projected].sort((a, b) => Math.hypot(a.x - size.width / 2, a.y - size.height / 2) -
    Math.hypot(b.x - size.width / 2, b.y - size.height / 2)).slice(0, 3), [projected, size]);
  const chosen = objects.find(s => s.id === selected);
  const sun = objects.find(s => s.kind === "sun");
  const results = useMemo(() => query.trim() ? objects.filter(s => matchesObject(s, query)).slice(0, 40)
    : objects.filter(s => s.kind !== "star"), [objects, query]);
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.width * dpr), height = Math.round(size.height * dpr);
    // Resizing the backing store on every sensor event caused avoidable clears.
    if (el.width !== width || el.height !== height) { el.width = width; el.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.width, size.height);
    if (ready && attitude) drawAR(ctx, projected, attitude, size.width, size.height, fov, selected, moonFraction, sun);
  }, [ready, attitude, projected, size, fov, selected, moonFraction, sun]);
  function stop() { session.stop(); observer.cancel(); setMapMode(false); setPanel(null); }
  function start() {
    setMapMode(false); setPanel(null);
    // Do not move either permission call into an effect or after an await.
    void session.start();
    if (observer.source === "gps" || !location) observer.request();
  }
  function browse() {
    session.stop(); setMapMode(true); setPanel(null);
    if (!location && observer.status !== "loading") observer.request();
  }
  function pick(id: string) {
    setSelected(id); setPanel(null);
    if (mapMode) {
      const target = objects.find(s => s.id === id);
      if (target && target.altitude >= 0) setView({ az: target.azimuth, alt: Math.min(89, target.altitude) });
    }
  }
  function updateVideoSize() {
    const el = video.current;
    if (!el) return;
    setVideoSize({ width: el.videoWidth, height: el.videoHeight });
    if (el.readyState >= 2 && !el.paused) setVideoReady(true);
  }
  const stage = !location ? observer.status === "error" ? "Location needed" : "Finding your location…"
    : playbackError ? "Camera playback unavailable" : session.cameraPaused ? "Camera paused"
    : !mapMode && !o ? "Waiting for motion data…" : !mapMode && !o?.absolute ? "Compass unavailable"
    : !ready ? "Starting camera…" : `${direction(heading)} ${Math.round(heading) % 360}° · altitude ${Math.round(elevation)}°`;
  const warning = !location ? observer.error || "Finding your location. The sky will appear automatically when it is ready."
    : !mapMode && playbackError ? playbackError : !mapMode && session.cameraPaused ? "Camera paused by the browser. Labels resume when the live feed returns."
    : !mapMode && session.error ? session.error : !mapMode && !o ? "Waiting for motion data. Allow motion access when asked."
    : !mapMode && !o?.absolute ? "This browser provides movement but no reliable north reference. Open in Safari or Chrome, retry sensors, or use the sky map."
    : "";
  let targetHint = "";
  if (chosen) {
    if (chosen.altitude < 0) targetHint = `${chosen.name} is below the horizon and cannot be seen from here right now.`;
    else if (!ready) targetHint = `${chosen.name}: waiting for location, camera and compass.`;
    else if (projected.some(p => p.object.id === chosen.id)) targetHint = `${chosen.name} is in your view. Tap Information to learn more.`;
    else {
      const az = wrap180(chosen.azimuth - heading), alt = chosen.altitude - elevation;
      targetHint = `Find ${chosen.name}: ${Math.abs(az) > 5 ? `turn ${az > 0 ? "right" : "left"} ${Math.round(Math.abs(az))}°` : "heading aligned"}${Math.abs(alt) > 5 ? `, tilt ${alt > 0 ? "up" : "down"} ${Math.round(Math.abs(alt))}°` : ""}.`;
    }
  }
  return (
    <section className={`ar-view${mapMode ? " ar-map-mode" : ""}`} role="dialog" aria-modal="true" aria-label="Camera AR"
      data-ready={ready} data-declination={declination ?? "unavailable"} data-mode={mapMode ? "map" : "ar"} data-rendered-objects={projected.length}
      onKeyDown={e => {
        if (e.key === "Escape") { if (panel) setPanel(null); else stop(); }
        if (e.key === "Tab") {
          const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button,input,a[href],canvas[tabindex='0']"))
            .filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <video ref={video} autoPlay muted playsInline className="ar-video" aria-label="Live rear camera"
        aria-hidden={!active || mapMode} onPlaying={() => { updateVideoSize(); setVideoReady(true); }}
        onLoadedData={updateVideoSize} onLoadedMetadata={updateVideoSize} onResize={updateVideoSize}
        onWaiting={() => setVideoReady(false)} onError={() => { setVideoReady(false); setPlaybackError("The camera stream stopped playing. Retry or use the sky map."); }} />
      <canvas ref={canvas} className="ar-canvas" aria-label={mapMode ? "Sky map: drag or use arrow keys to explore" : "Star and planet labels projected over the camera"}
        tabIndex={mapMode ? 0 : -1} onKeyDown={e => {
          if (!mapMode || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault(); setView(v => ({ az: wrap360(v.az + (e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0)),
            alt: Math.max(-30, Math.min(89, v.alt + (e.key === "ArrowUp" ? 5 : e.key === "ArrowDown" ? -5 : 0))) }));
        }}
        onPointerDown={e => { if (mapMode) { drag.current = { x: e.clientX, y: e.clientY, az: view.az, alt: view.alt, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={e => {
          if (!drag.current || !mapMode) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
          setView({ az: wrap360(drag.current.az - dx * 70 / size.width), alt: Math.max(-30, Math.min(89, drag.current.alt + dy * 70 / size.width)) });
        }}
        onPointerCancel={() => { drag.current = null; }}
        onPointerUp={e => {
          const moved = drag.current?.moved; drag.current = null;
          if (!ready || moved) return;
          const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
          const hit = [...projected].filter(p => Math.hypot(p.x - x, p.y - y) < 28)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
          if (hit) { setSelected(hit.object.id); setPanel("information"); }
        }} />
      <header className="ar-header"><span><Camera size={19} /><strong>{mapMode ? "Sky map" : "Camera AR"}</strong>
        <small>{mapMode ? "DRAG TO EXPLORE" : session.status === "active" ? session.cameraPaused ? "CAMERA PAUSED" : "LIVE" : "POINT. DISCOVER."}</small></span>
        {(active || session.status === "starting") && <button className="ar-icon" aria-label="Close camera AR" onClick={stop}><X /></button>}
      </header>
      {!active ? <div className="ar-setup">
        <div className="modal-illustration"><Camera size={26} /></div>
        <h2>Point your phone.<br />Meet the night sky.</h2>
        <p>Use your location and point your camera. Stars, the Moon and planets appear automatically as you turn and tilt.</p>
        <div className="ar-location"><MapPin size={18} /><span><strong>{location?.name ?? "Use your current location"}</strong>
          <small>{location ? `${location.latitude.toFixed(3)}°, ${location.longitude.toFixed(3)}°` : "No city selection or north calibration needed"}</small></span>
          <button onClick={() => { session.stop(); onChangeLocation(); }}>Change</button></div>
        <button ref={startButton} className="primary-button" disabled={session.status === "starting"} onClick={start}>
          {session.status === "starting" ? "Waiting for permissions…" : observer.source === "manual" ? "Start AR at this location" : "Start AR · use my location"}</button>
        {session.status === "starting" && <button className="secondary-button" onClick={stop}>Cancel camera request</button>}
        {session.error && <p role="alert" className="ar-error">{session.error}</p>}
        {observer.error && <p role="alert" className="ar-error">{observer.error}</p>}
        <button className="secondary-button" onClick={browse}>Explore sky map instead</button>
        <p className="ar-small">Allow location, camera and motion when asked. No microphone, recording or image uploads. Open on your phone in Safari or Chrome over HTTPS.</p>
        <p className="ar-small">Positions come from astronomy calculations, not camera recognition. Sensor alignment and lens width are approximate. Never aim optics at the Sun.</p>
        <p className="ar-small"><a href="https://github.com/Sancerio/skyviewer-web" target="_blank" rel="noreferrer">Open source</a>{" · "}<a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Data &amp; licenses</a></p>
      </div> : <>
        <div className="ar-status"><span>{stage}</span><span>{location?.name ?? "GPS"} · Live UTC {date.toISOString().slice(11, 16)}
          {observer.accuracy !== null ? ` · GPS ±${Math.round(observer.accuracy)} m` : ""}</span></div>
        <div className="ar-reticle" aria-hidden="true"><Crosshair size={38} /></div>
        {warning ? <div className="ar-callout" role="status">{warning}
          {!location && <><button onClick={() => observer.request()}>Retry location</button><button onClick={() => { session.stop(); onChangeLocation(); }}>Choose a location</button></>}
          {location && !mapMode && <><button onClick={() => { session.stop(); void session.start(); }}>Retry camera and sensors</button><button onClick={browse}>Explore sky map instead</button></>}
        </div> : <div className="ar-accuracy">{mapMode ? "Sky map · drag to explore, not camera-aligned" : `Automatic alignment · ${o?.reference === "webkit" ? "iPhone compass" : "device compass"} · ${declination === null ? "magnetic north; true-north correction unavailable" : "true north (WMM2025)"}`}
          {!mapMode && o?.accuracy !== undefined ? ` · compass ±${Math.round(o.accuracy)}°` : ""}
          {!mapMode && o?.accuracy !== undefined && o.accuracy > 25 ? " · Low compass accuracy; move away from metal" : ""}
          {ready && elevation < 0 ? " · Point above the horizon" : ""}
          {ready && sun && sun.altitude > -6 ? " · Daylight: stars are shown as a guide" : ""}</div>}
        <div className="ar-actions"><button className="ar-icon" aria-label="Search in camera AR" onClick={() => setPanel(panel === "search" ? null : "search")}><Search /></button>
          <button className="ar-icon" aria-label="Sky display settings" onClick={() => setPanel(panel === "display" ? null : "display")}><SlidersHorizontal /></button></div>
        {panel && <div className="ar-sheet"><div className="ar-sheet-title"><h2>{panel === "search" ? "Find in the sky" : panel === "display" ? "Sky display" : chosen?.name}</h2>
          <button className="ar-icon" aria-label={panel === "search" ? "Close AR search" : panel === "information" ? "Close AR information" : "Close display settings"} onClick={() => setPanel(null)}><X size={19} /></button></div>
          {panel === "search" && <><input className="ar-search" aria-label="Search AR objects" value={query} onChange={e => setQuery(e.target.value)} placeholder="Star, planet or constellation" autoFocus />
            <p className="ar-small">{objects.filter(s => s.kind === "star").length.toLocaleString()} catalog stars, Sun, Moon and seven planets. An arrow down means below your horizon.</p>
            <div className="ar-results">{results.map(s => <button key={s.id} onClick={() => pick(s.id)}><span>{s.name}<small>{s.constellation || s.kind}</small></span><span>{Math.round(s.altitude)}° {s.altitude >= 0 ? "↑" : "↓"}</span></button>)}
              {!results.length && <p>{location ? "No matching objects." : "Waiting for your location."}</p>}</div></>}
          {panel === "display" && <><label>Faintest stars <strong>magnitude {magnitudeLimit}</strong><input aria-label="Faintest AR stars" type="range" min="0" max="6" step="0.5" value={magnitudeLimit} onChange={e => setMagnitudeLimit(Number(e.target.value))} /></label>
            <p>Compass alignment is automatic. No flat-phone setup, north pointing or heading slider is required.</p>
            <p className="ar-small">Object markers are enlarged for readability. This is sensor-based AR, not precision optical alignment.</p>
            <button className="secondary-button" onClick={mapMode ? start : browse}>{mapMode ? "Switch to camera AR" : "Explore sky map instead"}</button>
            <button className="secondary-button" onClick={() => { session.stop(); onChangeLocation(); }}>Change observing location</button></>}
          {panel === "information" && chosen && <ObjectInformation object={chosen} />}
        </div>}
        {!panel && <div className="ar-bottom">{chosen ? <><p role="status">{targetHint}</p><div className="ar-target"><span><strong>{chosen.name}</strong><small>{chosen.constellation || chosen.kind} · magnitude {chosen.magnitude.toFixed(1)}</small></span>
          <button onClick={() => setPanel("information")}>Information ↗</button><button className="ar-icon" aria-label="Clear AR target" onClick={() => setSelected(undefined)}><X size={16} /></button></div></>
          : <><span className="eyebrow">{ready ? `${projected.length} OBJECTS IN THIS DIRECTION` : "GETTING YOUR SKY READY"}</span><div className="ar-nearby">
            {nearest.length ? nearest.map(({ object: s }) => <button key={s.id} onClick={() => { setSelected(s.id); setPanel("information"); }}>{s.name}<small>{s.kind}</small></button>)
              : <p>{ready ? elevation < 0 ? "Point up to see the sky above your horizon." : "No catalog objects in this view. Turn slowly or search for the Moon or a planet." : stage}</p>}</div></>}</div>}
        <button className="ar-stop" onClick={stop}>{mapMode ? "Close sky map" : "Stop camera"}</button>
      </>}
    </section>
  );
}
