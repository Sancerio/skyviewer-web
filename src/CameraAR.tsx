import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Compass,
  Crosshair,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { getSky, direction, type Location, type SkyObject } from "./sky";
import {
  deviceAttitude,
  effectiveHorizontalFov,
  projectAR,
} from "./orientation";
import { useARSession } from "./useARSession";
import { matchesObject } from "./search";
import ObjectInformation from "./ObjectInformation";
const angleOf = (v: number[]) =>
  ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360;
const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
export default function CameraAR({
  location,
  onClose,
  onChangeLocation,
}: {
  location: Location;
  onClose: () => void;
  onChangeLocation: () => void;
}) {
  const session = useARSession();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [date, setDate] = useState(() => new Date());
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState<number | null>(null);
  const [trim, setTrim] = useState(0);
  const [magnitudeLimit, setMagnitudeLimit] = useState(3.5);
  const [videoReady, setVideoReady] = useState(false);
  const [lensFov, setLensFov] = useState(65);
  const [calibration, setCalibration] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const [details, setDetails] = useState(false);
  const [notice, setNotice] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    startButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setDate(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const el = canvas.current!;
    const observer = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0 && e.contentRect.height > 0)
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.srcObject = session.stream;
    setVideoReady(false);
    setVideoSize({ width: 0, height: 0 });
    setPlaybackError("");
    let cancelled = false;
    if (session.stream)
      void el.play().catch(() => {
        if (!cancelled)
          setPlaybackError("The camera could not play. Stop AR and try again.");
      });
    return () => {
      cancelled = true;
      el.srcObject = null;
    };
  }, [session.stream]);
  const [screenAngle, setScreenAngle] = useState(
    () =>
      screen.orientation?.angle ??
      (window as unknown as { orientation?: number }).orientation ??
      0,
  );
  useEffect(() => {
    const update = () =>
      setScreenAngle(
        screen.orientation?.angle ??
          (window as unknown as { orientation?: number }).orientation ??
          0,
      );
    screen.orientation?.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    return () => {
      screen.orientation?.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  const objects = useMemo(() => getSky(date, location), [date, location]);
  const o = session.orientation;
  const source = useRef<boolean | null>(null);
  useEffect(() => {
    if (o && source.current !== o.absolute) {
      if (source.current !== null) {
        setOffset(null);
        setTrim(0);
        setNotice("The orientation reference changed. Check alignment again.");
      }
      source.current = o.absolute;
    }
  }, [o]);
  const calibrated = offset !== null || o?.absolute === true;
  const attitude = useMemo(
    () =>
      o && calibrated
        ? deviceAttitude(
            o.alpha,
            o.beta,
            o.gamma,
            screenAngle,
            (offset ?? 0) + trim,
          )
        : null,
    [o, calibrated, screenAngle, offset, trim],
  );
  const videoWidth = videoSize.width || session.videoSettings?.width || 0,
    videoHeight = videoSize.height || session.videoSettings?.height || 0;
  const fov =
    videoWidth > 0 && videoHeight > 0
      ? effectiveHorizontalFov(
          lensFov,
          videoWidth,
          videoHeight,
          size.width,
          size.height,
        )
      : 40;
  const ready =
    session.status === "active" &&
    attitude !== null &&
    videoWidth > 0 &&
    videoReady &&
    !session.cameraPaused &&
    !playbackError;
  const heading = attitude ? angleOf(attitude.forward) : null;
  const elevation = attitude
    ? (Math.asin(Math.max(-1, Math.min(1, attitude.forward[2]))) * 180) /
      Math.PI
    : null;
  const chosen = objects.find((s) => s.id === selected);
  const candidates = useMemo(
    () =>
      objects.filter(
        (s) =>
          s.altitude >= 0 &&
          (s.kind !== "star" ||
            s.magnitude <= magnitudeLimit ||
            s.id === selected),
      ),
    [objects, selected, magnitudeLimit],
  );
  const nearest = useMemo(
    () =>
      !attitude
        ? []
        : candidates
            .map((s) => ({
              s,
              p: projectAR(
                s.altitude,
                s.azimuth,
                attitude,
                fov,
                size.width,
                size.height,
              ),
            }))
            .filter(({ p }) => p.visible)
            .sort(
              (a, b) =>
                Math.hypot(a.p.x - size.width / 2, a.p.y - size.height / 2) -
                Math.hypot(b.p.x - size.width / 2, b.p.y - size.height / 2),
            )
            .slice(0, 4),
    [attitude, candidates, fov, size],
  );
  const searchResults = useMemo(
    () =>
      query.trim()
        ? objects.filter((s) => matchesObject(s, query)).slice(0, 30)
        : objects.filter((s) => s.kind !== "star"),
    [objects, query],
  );
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx || size.width <= 0 || size.height <= 0) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    el.width = size.width * dpr;
    el.height = size.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.width, size.height);
    if (!ready || !attitude) return;
    const occupied: { x: number; y: number }[] = [];
    for (const s of [...candidates].sort((a, b) =>
      a.id === selected
        ? -1
        : b.id === selected
          ? 1
          : a.magnitude - b.magnitude,
    )) {
      const p = projectAR(
        s.altitude,
        s.azimuth,
        attitude,
        fov,
        size.width,
        size.height,
      );
      if (!p.visible) continue;
      ctx.strokeStyle = s.id === selected ? "#f3d192" : "#c9efda";
      ctx.fillStyle = "#eaf8f0";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        s.id === selected ? 13 : s.kind === "star" ? 4 : 7,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (
        s.id === selected ||
        !occupied.some(
          (b) => Math.abs(b.x - p.x) < 115 && Math.abs(b.y - p.y) < 27,
        )
      ) {
        ctx.font = "500 13px sans-serif";
        ctx.textAlign = p.x > size.width - 120 ? "right" : "left";
        ctx.strokeStyle = "#000b";
        ctx.lineWidth = 4;
        const x = p.x + (ctx.textAlign === "right" ? -13 : 13);
        ctx.strokeText(s.name, x, p.y - 9);
        ctx.fillText(s.name, x, p.y - 9);
        occupied.push(p);
      }
    }
    ctx.shadowBlur = 0;
  }, [attitude, candidates, ready, selected, fov, size]);
  function close() {
    session.stop();
    onClose();
  }
  function calibrateNorth() {
    if (!o) return;
    const raw = deviceAttitude(o.alpha, o.beta, o.gamma, screenAngle);
    if (Math.hypot(raw.forward[0], raw.forward[1]) < 0.3) {
      setNotice("Lower the camera toward the horizon before aligning north.");
      return;
    }
    setOffset(-angleOf(raw.forward));
    setTrim(0);
    setNotice(
      "North reference set. Lift the phone to explore; refine the overlay using a known star.",
    );
  }
  function calibrateCompass() {
    if (!o || o.heading === undefined) return;
    if (Math.abs(o.beta) > 20 || Math.abs(o.gamma) > 20) {
      setNotice(
        "Lay the phone flat, screen facing up, before using its compass.",
      );
      return;
    }
    if (o.accuracy !== undefined && (o.accuracy < 0 || o.accuracy > 40)) {
      setNotice(
        "The compass reading is unreliable. Move away from metal or use a known north reference.",
      );
      return;
    }
    setOffset(wrap(o.heading + o.alpha));
    setTrim(0);
    setNotice(
      "Compass reference set. Lift the phone and check a known star; magnetic north may differ from true north.",
    );
  }
  const targetHint =
    chosen && attitude && ready
      ? (() => {
          if (chosen.altitude < 0)
            return `${chosen.name} is below the horizon. It cannot be seen from here right now.`;
          const p = projectAR(
            chosen.altitude,
            chosen.azimuth,
            attitude,
            fov,
            size.width,
            size.height,
          );
          if (p.visible)
            return `${chosen.name} is in your camera view. Tap Information to learn more.`;
          const delta = wrap(chosen.azimuth - (heading ?? 0));
          const altDelta = chosen.altitude - (elevation ?? 0);
          return `Find ${chosen.name}: ${Math.abs(delta) > 8 ? `turn ${delta > 0 ? "right" : "left"} ${Math.round(Math.abs(delta))}°` : "heading aligned"}${Math.abs(altDelta) > 5 ? `, tilt ${altDelta > 0 ? "up" : "down"} ${Math.round(Math.abs(altDelta))}°` : ""}.`;
        })()
      : "";
  return (
    <section
      className="ar-view"
      role="dialog"
      aria-modal="true"
      aria-label="Camera AR"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          close();
          return;
        }
        if (e.key === "Tab") {
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button,input,a[href]",
            ),
          ).filter(
            (el) =>
              !el.hasAttribute("disabled") && el.getClientRects().length > 0,
          );
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className="ar-video"
        aria-label="Live rear camera"
        aria-hidden={session.status !== "active"}
        onPlaying={() => setVideoReady(true)}
        onWaiting={() => setVideoReady(false)}
        onError={() => {
          setVideoReady(false);
          setPlaybackError(
            "The camera stream stopped playing. Stop AR and try again.",
          );
        }}
        onLoadedMetadata={() => {
          if (video.current)
            setVideoSize({
              width: video.current.videoWidth,
              height: video.current.videoHeight,
            });
        }}
        onResize={() => {
          if (video.current)
            setVideoSize({
              width: video.current.videoWidth,
              height: video.current.videoHeight,
            });
        }}
      />
      <canvas
        ref={canvas}
        className="ar-canvas"
        aria-label="Star and planet labels projected over the camera"
        onPointerUp={(event) => {
          if (!attitude || !ready) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const hit = candidates
            .map((s) => ({
              s,
              p: projectAR(
                s.altitude,
                s.azimuth,
                attitude,
                fov,
                size.width,
                size.height,
              ),
            }))
            .filter(({ p }) => p.visible && Math.hypot(p.x - x, p.y - y) < 30)
            .sort(
              (a, b) =>
                Math.hypot(a.p.x - x, a.p.y - y) -
                Math.hypot(b.p.x - x, b.p.y - y),
            )[0];
          if (hit) {
            setSelected(hit.s.id);
            setDetails(true);
            setSearching(false);
            setCalibration(false);
          }
        }}
      />
      <header className="ar-header">
        <span>
          <Camera size={19} />
          <strong>Camera AR</strong>
          <small>
            {session.status === "active"
              ? session.cameraPaused
                ? "CAMERA PAUSED"
                : "LIVE"
              : "POINT. DISCOVER."}
          </small>
        </span>
        {(session.status === "active" || session.status === "starting") && (
          <button
            ref={closeButton}
            className="ar-icon"
            aria-label="Close camera AR"
            onClick={close}
          >
            <X />
          </button>
        )}
      </header>
      {session.status !== "active" ? (
        <div className="ar-setup">
          <div className="modal-illustration">
            <Camera size={26} />
          </div>
          <h2>
            Point your phone.
            <br />
            Meet the night sky.
          </h2>
          <p>
            Stars and planets appear over your rear camera as you turn and tilt
            your phone.
          </p>
          <div className="ar-location">
            <MapPin size={18} />
            <span>
              <strong>{location.name}</strong>
              <small>
                {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}
                °
              </small>
            </span>
            <button
              onClick={() => {
                session.stop();
                onChangeLocation();
              }}
            >
              Change
            </button>
          </div>
          <p className="ar-small">
            Use your actual observing location. AR always shows the sky at the
            current time.
          </p>
          <button
            ref={startButton}
            className="primary-button"
            disabled={session.status === "starting"}
            onClick={() => {
              setOffset(null);
              setTrim(0);
              setNotice("");
              void session.start();
            }}
          >
            {session.status === "starting"
              ? "Waiting for permissions…"
              : "Use this location & start camera"}
          </button>
          {session.status === "starting" && (
            <button className="secondary-button" onClick={session.stop}>
              Cancel camera request
            </button>
          )}
          <p className="ar-small">
            Allow camera and motion access when asked. No microphone, recording,
            or image uploads. Works best on a phone over HTTPS.
          </p>
          {session.error && (
            <p role="alert" className="ar-error">
              {session.error}
            </p>
          )}
          <p className="ar-small">
            This uses your location and sensors to place catalog objects—not
            image recognition. Check alignment against a known star. Never aim
            optics at the Sun.
          </p>
          <p className="ar-small">
            <a
              href="https://github.com/Sancerio/skyviewer-web"
              target="_blank"
              rel="noreferrer"
            >
              Open source
            </a>
            {" · "}
            <a
              href="./THIRD_PARTY_NOTICES.txt"
              target="_blank"
              rel="noreferrer"
            >
              Data &amp; licenses
            </a>
          </p>
        </div>
      ) : (
        <>
          <div className="ar-status">
            <span>
              {ready
                ? `${direction(heading!)} ${Math.round(heading!)}° · altitude ${Math.round(elevation!)}°`
                : "Alignment needed"}
            </span>
            <span>
              {location.name} · Live UTC {date.toISOString().slice(11, 16)}
            </span>
          </div>
          <div className="ar-reticle" aria-hidden="true">
            <Crosshair size={38} />
          </div>
          {!o ? (
            <div className="ar-callout" role="status">
              Waiting for motion data. Move the phone gently. If no data
              arrives, check browser motion permissions and try again.
            </div>
          ) : !calibrated ? (
            <div className="ar-callout" role="status">
              Set a north reference before identifying stars.{" "}
              <button onClick={() => setCalibration(true)}>
                Calibrate alignment
              </button>
            </div>
          ) : (
            <div className="ar-accuracy">
              Approximate alignment ·{" "}
              {offset !== null ? "calibrated reference" : "device north"}
              {o.accuracy !== undefined
                ? o.accuracy >= 0
                  ? ` · compass ±${Math.round(o.accuracy)}°`
                  : " · compass unreliable"
                : ""}
              {elevation! < 0 ? " · Point above the horizon" : ""}
            </div>
          )}
          {session.cameraPaused && (
            <div role="status" className="ar-callout">
              Camera paused by the browser. Labels will resume when the
              rear-camera feed returns.
            </div>
          )}
          {playbackError && (
            <div role="alert" className="ar-callout">
              {playbackError}
            </div>
          )}
          <div className="ar-actions">
            <button
              className="ar-icon"
              aria-label="Search in camera AR"
              onClick={() => {
                setSearching(!searching);
                setDetails(false);
                setCalibration(false);
              }}
            >
              <Search />
            </button>
            <button
              className="ar-icon"
              aria-label="Calibrate camera alignment"
              onClick={() => {
                setCalibration(!calibration);
                setSearching(false);
                setDetails(false);
              }}
            >
              <SlidersHorizontal />
            </button>
          </div>
          {calibration && (
            <div className="ar-sheet">
              <div className="ar-sheet-title">
                <h2>Align your sky</h2>
                <button
                  aria-label="Close calibration"
                  className="ar-icon"
                  onClick={() => setCalibration(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <p>
                Point the rear camera toward{" "}
                <strong>true north at the horizon</strong>, using a known
                landmark. Then set the reference.
              </p>
              <button
                className="secondary-button"
                disabled={!o}
                onClick={calibrateNorth}
              >
                <Compass size={16} /> Set camera direction to north
              </button>
              {o?.heading !== undefined && (
                <>
                  <p>
                    Or lay the phone flat, screen up, and use its compass. This
                    can be affected by magnetic interference.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={calibrateCompass}
                  >
                    Use flat-phone compass
                  </button>
                </>
              )}
              <label>
                Heading correction <strong>{trim}°</strong>
                <input
                  aria-label="AR heading correction"
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={trim}
                  onChange={(e) => setTrim(Number(e.target.value))}
                />
              </label>
              <label>
                Faintest stars <strong>magnitude {magnitudeLimit}</strong>
                <input
                  aria-label="Faintest AR stars"
                  type="range"
                  min="0"
                  max="6"
                  step="0.5"
                  value={magnitudeLimit}
                  onChange={(e) => setMagnitudeLimit(Number(e.target.value))}
                />
              </label>
              <label>
                Camera field of view <strong>{lensFov}°</strong>
                <input
                  aria-label="Camera field of view"
                  type="range"
                  min="35"
                  max="100"
                  step="1"
                  value={lensFov}
                  onChange={(e) => setLensFov(Number(e.target.value))}
                />
              </label>
              <p className="ar-small">
                Lens width is estimated. Adjust until the overlay spacing
                matches known stars; ultra-wide lenses need a wider setting.
                Camera cropping is accounted for automatically.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  setOffset(null);
                  setTrim(0);
                  setLensFov(65);
                  setNotice(
                    "Calibration reset. Relative sensors need a new north reference.",
                  );
                }}
              >
                Reset calibration
              </button>
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
          {searching && (
            <div className="ar-sheet">
              <div className="ar-sheet-title">
                <h2>Find in the sky</h2>
                <button
                  className="ar-icon"
                  aria-label="Close AR search"
                  onClick={() => setSearching(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <input
                className="ar-search"
                aria-label="Search AR objects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Star, planet or constellation"
              />
              <p className="ar-small">
                5,044 catalog stars, Sun, Moon and seven planets. Faint stars
                may need darker skies or optics.
              </p>
              <div className="ar-results">
                {searchResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelected(s.id);
                      setSearching(false);
                    }}
                  >
                    <span>
                      {s.name}
                      <small>{s.constellation || s.kind}</small>
                    </span>
                    <span>
                      {Math.round(s.altitude)}° {s.altitude >= 0 ? "↑" : "↓"}
                    </span>
                  </button>
                ))}
                {!searchResults.length && <p>No matching objects.</p>}
              </div>
            </div>
          )}
          {details && chosen && (
            <div className="ar-sheet">
              <div className="ar-sheet-title">
                <h2>{chosen.name}</h2>
                <button
                  className="ar-icon"
                  aria-label="Close AR information"
                  onClick={() => setDetails(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <ObjectInformation object={chosen} />
            </div>
          )}
          {!calibration && !searching && !details && (
            <div className="ar-bottom">
              {chosen ? (
                <>
                  <p role="status">
                    {targetHint ||
                      `${chosen.name}: waiting for live camera and aligned motion data.`}
                  </p>
                  <div className="ar-target">
                    <span>
                      <strong>{chosen.name}</strong>
                      <small>
                        {chosen.constellation || chosen.kind} · magnitude{" "}
                        {chosen.magnitude.toFixed(1)}
                      </small>
                    </span>
                    <button onClick={() => setDetails(true)}>
                      Information ↗
                    </button>
                    <button
                      aria-label="Clear AR target"
                      className="ar-icon"
                      onClick={() => setSelected(undefined)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="eyebrow">IN THIS DIRECTION</span>
                  <div className="ar-nearby">
                    {ready && nearest.length ? (
                      nearest.map(({ s }) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelected(s.id);
                            setDetails(true);
                          }}
                        >
                          {s.name}
                          <small>{s.kind}</small>
                        </button>
                      ))
                    ) : (
                      <p>
                        {ready
                          ? "No bright catalog objects here. Turn slowly, or search for an object."
                          : "Labels appear once the camera and alignment are ready."}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            className="ar-stop"
            onClick={() => {
              session.stop();
              setCalibration(false);
              setSearching(false);
              setDetails(false);
            }}
          >
            Stop camera
          </button>
        </>
      )}
    </section>
  );
}
