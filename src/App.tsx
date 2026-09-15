import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Github,
  Globe2,
  Grid2X2,
  Info,
  LocateFixed,
  MapPin,
  Moon,
  Orbit,
  Plus,
  Minus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  X,
} from "lucide-react";
import SkyCanvas, { type View } from "./SkyCanvas";
import { getSky, direction, type Location, type SkyObject } from "./sky";
const cities: Location[] = [
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "London", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York", latitude: 40.7128, longitude: -74.006 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { name: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
  { name: "Reykjavík", latitude: 64.1466, longitude: -21.9426 },
];
const degrees = (n: number) => `${n.toFixed(1)}°`;
const isoInput = (d: Date) => d.toISOString().slice(0, 16);
export default function App() {
  const [location, setLocation] = useState<Location>(cities[0]);
  const [date, setDate] = useState(new Date());
  const [live, setLive] = useState(true);
  const [view, setView] = useState<View>({ az: 180, alt: 38, fov: 100 });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All objects");
  const [selected, setSelected] = useState<string>();
  const [lines, setLines] = useState(true);
  const [labels, setLabels] = useState(true);
  const [grid, setGrid] = useState(false);
  const [night, setNight] = useState(false);
  const [modal, setModal] = useState<"location" | "about" | null>(null);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [lat, setLat] = useState("1.3521");
  const [lon, setLon] = useState("103.8198");
  const [locationError, setLocationError] = useState("");
  const [following, setFollowing] = useState(false);
  const sensorCleanup = useRef<() => void>(() => {});
  const modalClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!live) return;
    setDate(new Date());
    const t = setInterval(() => setDate(new Date()), 15000);
    return () => clearInterval(t);
  }, [live]);
  useEffect(() => () => sensorCleanup.current(), []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    modalClose.current?.focus();
    return () => previous?.focus();
  }, [modal]);
  const objects = useMemo(() => getSky(date, location), [date, location]);
  const chosen = objects.find((o) => o.id === selected);
  const sun = objects.find((o) => o.kind === "sun");
  const results = useMemo(
    () =>
      objects
        .filter((o) =>
          !query
            ? o.altitude > 0 && (o.kind !== "star" || o.magnitude < 2.5)
            : `${o.name} ${o.constellation || ""}`
                .toLowerCase()
                .includes(query.toLowerCase()),
        )
        .filter(
          (o) =>
            filter === "All objects" ||
            (filter === "Stars" ? o.kind === "star" : o.kind !== "star"),
        )
        .sort((a, b) => a.magnitude - b.magnitude)
        .slice(0, query ? 60 : 12),
    [objects, query, filter],
  );
  function focusObject(o: SkyObject) {
    setSelected(o.id);
    stopFollowing();
    setView((v) => ({
      ...v,
      az: o.azimuth,
      alt: Math.max(-89, Math.min(89, o.altitude)),
    }));
    if (o.altitude < 0)
      setMessage(`${o.name} is below the horizon at this time and location.`);
    else setMessage("");
  }
  function changeLocation(l: Location) {
    setLocation(l);
    setLat(String(l.latitude));
    setLon(String(l.longitude));
    setLocationError("");
    setModal(null);
    setMessage(`Sky updated for ${l.name}.`);
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationError(
        "Location is unavailable in this browser. Choose a city or enter coordinates.",
      );
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        changeLocation({
          name: "Your location",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setLocationError(
          "Location could not be accessed. Choose a city or enter coordinates instead.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  function stopFollowing() {
    sensorCleanup.current();
    setFollowing(false);
  }
  async function followCompass() {
    if (following) {
      stopFollowing();
      setMessage("Compass stopped. Drag the map to explore.");
      return;
    }
    if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) {
      setMessage(
        "Compass is unavailable here. Use the map controls, or open on a phone over HTTPS.",
      );
      return;
    }
    const Device = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (
        Device.requestPermission &&
        (await Device.requestPermission()) !== "granted"
      ) {
        setMessage(
          "Motion access was declined. You can still explore by dragging the map.",
        );
        return;
      }
      let received = false;
      const handler = (event: DeviceOrientationEvent) => {
        const e = event as DeviceOrientationEvent & {
          webkitCompassHeading?: number;
        };
        const heading =
          typeof e.webkitCompassHeading === "number"
            ? e.webkitCompassHeading
            : e.absolute && e.alpha !== null
              ? (360 - e.alpha) % 360
              : null;
        if (heading === null) return;
        received = true;
        setFollowing(true);
        setView((v) => ({ ...v, az: heading }));
      };
      window.addEventListener("deviceorientation", handler);
      window.addEventListener("deviceorientationabsolute", handler);
      const timeout = setTimeout(() => {
        if (!received) {
          stopFollowing();
          setMessage(
            "No absolute compass signal. Try a supported phone, or drag the map.",
          );
        }
      }, 4000);
      sensorCleanup.current = () => {
        clearTimeout(timeout);
        window.removeEventListener("deviceorientation", handler);
        window.removeEventListener("deviceorientationabsolute", handler);
      };
      setFollowing(true);
      setMessage(
        "Compass mode: hold your phone flat, top edge pointing ahead. Tilt is manual; headings are approximate.",
      );
    } catch {
      stopFollowing();
      setMessage("Compass access failed. Drag the map to explore.");
    }
  }
  const moveView = (v: View) => {
    if (following) stopFollowing();
    setView(v);
  };
  const shiftTime = (hours: number) => {
    setLive(false);
    setDate(
      (d) =>
        new Date(
          Math.max(
            Date.UTC(1900, 0, 1),
            Math.min(
              Date.UTC(2100, 11, 31, 23, 59),
              d.getTime() + hours * 3600000,
            ),
          ),
        ),
    );
  };
  const phase =
    sun && sun.altitude > 0
      ? "Daytime"
      : sun && sun.altitude > -18
        ? "Twilight"
        : "Night sky";
  return (
    <div className={night ? "app night-mode" : "app"}>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Sparkles size={23} />
          </span>
          skyviewer<span className="web-tag">WEB</span>
        </a>
        <nav aria-label="Main navigation">
          <span className="nav-current">
            <Orbit size={15} /> Explore the sky
          </span>
          <button onClick={() => setModal("about")}>
            Field guide <ArrowUpRight size={13} />
          </button>
        </nav>
        <a
          aria-label="Open source on GitHub"
          className="github-link"
          href="https://github.com/Sancerio/skyviewer-web"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
          <span>Open source</span>
          <ArrowUpRight size={13} />
        </a>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> A WINDOW TO THE UNIVERSE
            </div>
            <h1>A little closer to the cosmos.</h1>
            <p>The sky above you. A whole universe to explore.</p>
          </div>
          <button
            className="location-button"
            onClick={() => {
              setLocationError("");
              setModal("location");
            }}
          >
            <MapPin size={18} />
            <span>
              <strong>{location.name}</strong>
              <small>
                {degrees(Math.abs(location.latitude))}{" "}
                {location.latitude >= 0 ? "N" : "S"} &nbsp;{" "}
                {degrees(Math.abs(location.longitude))}{" "}
                {location.longitude >= 0 ? "E" : "W"}
                {location.name === "Singapore" ? " · Default location" : ""}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </section>
        <div className="workspace">
          <section className="sky-panel" aria-label="Sky explorer">
            <div className="map-top">
              <span className="map-badge">
                <i />
                {live ? "LIVE SKY" : "TIME TRAVEL"}
              </span>
              <span className="map-caption">
                {phase} <span>·</span> {location.name}
              </span>
              <button
                className="icon-button"
                aria-label="Sky map guide"
                onClick={() => setModal("about")}
              >
                <Info size={16} />
              </button>
            </div>
            <SkyCanvas
              objects={objects}
              date={date}
              location={location}
              view={view}
              onView={moveView}
              selected={selected}
              onSelect={setSelected}
              lines={lines}
              labels={labels}
              grid={grid}
              night={night}
            />
            <div className="map-heading">
              <Compass size={15} />
              <span>
                Looking {direction(view.az)}{" "}
                <strong>{Math.round(view.az)}°</strong>
              </span>
              <span className="heading-divider" />
              <span>Altitude {Math.round(view.alt)}°</span>
            </div>
            <div className="map-tools">
              <button
                className={`icon-button ${following ? "active" : ""}`}
                onClick={followCompass}
                title="Follow phone compass"
                aria-label={following ? "Stop compass" : "Follow phone compass"}
              >
                <Compass size={19} />
              </button>
              <span />
              <button
                className="icon-button"
                aria-label="Zoom in"
                disabled={view.fov <= 25}
                onClick={() =>
                  moveView({ ...view, fov: Math.max(25, view.fov - 10) })
                }
              >
                <Plus size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Zoom out"
                disabled={view.fov >= 120}
                onClick={() =>
                  moveView({ ...view, fov: Math.min(120, view.fov + 10) })
                }
              >
                <Minus size={19} />
              </button>
              <span />
              <button
                className="icon-button"
                aria-label="Reset sky view"
                onClick={() => {
                  stopFollowing();
                  setView({ az: 180, alt: 38, fov: 100 });
                  setSelected(undefined);
                }}
              >
                <Crosshair size={18} />
              </button>
            </div>
            {chosen && (
              <div className="selection-card">
                <div>
                  <span className="eyebrow">{chosen.kind}</span>
                  <button
                    aria-label="Close object details"
                    className="icon-button"
                    onClick={() => setSelected(undefined)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <h2>{chosen.name}</h2>
                <p>
                  {chosen.altitude >= 0
                    ? "Above the horizon"
                    : "Below the horizon"}{" "}
                  · {direction(chosen.azimuth)}
                </p>
                <dl>
                  <div>
                    <dt>Altitude</dt>
                    <dd>{degrees(chosen.altitude)}</dd>
                  </div>
                  <div>
                    <dt>Azimuth</dt>
                    <dd>{degrees(chosen.azimuth)}</dd>
                  </div>
                  <div>
                    <dt>Magnitude</dt>
                    <dd>{chosen.magnitude.toFixed(1)}</dd>
                  </div>
                </dl>
                <button
                  className="text-button"
                  onClick={() => focusObject(chosen)}
                >
                  Center in sky <Crosshair size={13} />
                </button>
              </div>
            )}
            <div className="map-bottom">
              <span>
                Drag to explore <span>·</span> Scroll to zoom
              </span>
              <span>{Math.round(view.fov)}° FIELD OF VIEW</span>
            </div>
          </section>
          <aside className="explore-panel">
            <div className="panel-title">
              <span>
                <Sparkles size={17} /> Discover
              </span>
              <span className="tiny-label">YOUR SKY, NOW</span>
            </div>
            <div className="search-box">
              <Search size={16} />
              <input
                aria-label="Search celestial objects"
                placeholder="Find a star or planet…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  aria-label="Clear search"
                  className="icon-button"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="filter-tabs" aria-label="Object filters">
              {["All objects", "Stars", "Solar system"].map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  className={filter === f ? "selected" : ""}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="list-heading">
              <span>{query ? "SEARCH RESULTS" : "ABOVE YOUR HORIZON"}</span>
              <span>ALTITUDE</span>
            </div>
            <div className="object-list">
              {results.length ? (
                results.map((o) => (
                  <button
                    className={`object-row ${selected === o.id ? "selected" : ""}`}
                    key={o.id}
                    onClick={() => focusObject(o)}
                  >
                    <span className={`object-icon ${o.kind}`}>
                      {o.kind === "moon" ? (
                        <Moon size={18} />
                      ) : o.kind === "sun" ? (
                        <Sun size={18} />
                      ) : o.kind === "planet" ? (
                        <Orbit size={18} />
                      ) : (
                        <Star size={16} />
                      )}
                    </span>
                    <span className="object-name">
                      <strong>{o.name}</strong>
                      <small>
                        {o.kind === "star"
                          ? o.constellation || "Star"
                          : o.kind === "planet"
                            ? "Planet"
                            : o.kind === "moon"
                              ? "Earth’s natural satellite"
                              : "Our star"}
                      </small>
                    </span>
                    <span className={o.altitude < 0 ? "below" : "object-alt"}>
                      {Math.round(o.altitude)}°{" "}
                      {o.altitude < 0 ? (
                        <ArrowDown size={12} />
                      ) : (
                        <ArrowUpRight size={12} />
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <Search size={22} />
                  <p>No objects found.</p>
                  <small>
                    Try a star name like Sirius or a planet like Saturn.
                  </small>
                </div>
              )}
            </div>
            <div className="sky-note">
              <span className="note-icon">
                {sun && sun.altitude > 0 ? (
                  <Sun size={19} />
                ) : (
                  <Moon size={19} />
                )}
              </span>
              <div>
                <strong>
                  {sun && sun.altitude > 0
                    ? "The stars are still there."
                    : "Take a moment. Look up."}
                </strong>
                <p>
                  {sun && sun.altitude > 0
                    ? "This map shows the sky in daylight, too. Move time forward to plan a night outside."
                    : "Find a darker spot and give your eyes time to adjust. Faint stars are easier to see."}
                </p>
              </div>
            </div>
          </aside>
        </div>
        <section className="control-bar" aria-label="Time and display controls">
          <div className="time-controls">
            <span className="time-icon">
              <Orbit size={19} />
            </span>
            <div className="date-control">
              <label htmlFor="sky-time">OBSERVING TIME · UTC</label>
              <input
                id="sky-time"
                type="datetime-local"
                min="1900-01-01T00:00"
                max="2100-12-31T23:59"
                value={isoInput(date)}
                onChange={(e) => {
                  const d = new Date(e.currentTarget.value + "Z");
                  if (
                    Number.isFinite(d.getTime()) &&
                    d.getUTCFullYear() >= 1900 &&
                    d.getUTCFullYear() <= 2100 &&
                    isoInput(d) !== isoInput(date)
                  ) {
                    setLive(false);
                    setDate(d);
                  }
                }}
                onBlur={(e) => {
                  const d = new Date(e.currentTarget.value + "Z");
                  if (
                    Number.isFinite(d.getTime()) &&
                    d.getUTCFullYear() >= 1900 &&
                    d.getUTCFullYear() <= 2100 &&
                    isoInput(d) !== isoInput(date)
                  ) {
                    setLive(false);
                    setDate(d);
                  }
                }}
              />
            </div>
            <div className="time-step">
              <button
                aria-label="One hour earlier"
                onClick={() => shiftTime(-1)}
                className="icon-button"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => setLive(true)}
                className={live ? "now active" : "now"}
              >
                Now
              </button>
              <button
                aria-label="One hour later"
                onClick={() => shiftTime(1)}
                className="icon-button"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="display-controls">
            <button
              className={lines ? "toggle enabled" : "toggle"}
              aria-pressed={lines}
              onClick={() => setLines(!lines)}
            >
              <Sparkles size={16} />
              <span>Constellations</span>
            </button>
            <button
              className={labels ? "toggle enabled" : "toggle"}
              aria-pressed={labels}
              onClick={() => setLabels(!labels)}
            >
              <span className="label-symbol">Aa</span>
              <span>Labels</span>
            </button>
            <button
              className={grid ? "toggle enabled" : "toggle"}
              aria-pressed={grid}
              onClick={() => setGrid(!grid)}
            >
              <Grid2X2 size={16} />
              <span>Grid</span>
            </button>
            <span className="control-divider" />
            <button
              className={night ? "toggle enabled" : "toggle"}
              aria-pressed={night}
              onClick={() => setNight(!night)}
            >
              <Moon size={16} />
              <span>Night mode</span>
            </button>
          </div>
        </section>
        {message && (
          <div className="status-message" role="status">
            {message}
            <button
              aria-label="Dismiss message"
              className="icon-button"
              onClick={() => setMessage("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <footer>
          <span>
            <Globe2 size={13} /> One sky. Endless curiosity.
          </span>
          <span>
            Calculated locally <span>·</span> No account needed <span>·</span>
            <button onClick={() => setModal("about")}>About this sky</button>
          </span>
        </footer>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal(null);
              if (e.key === "Tab") {
                const controls = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button, input, a[href]",
                  ),
                ).filter((el) => !el.hasAttribute("disabled"));
                const first = controls[0],
                  last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              ref={modalClose}
              className="icon-button modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "location" ? (
              <>
                <div className="modal-illustration">
                  <MapPin size={25} />
                </div>
                <h2 id="modal-title">Where are you looking up?</h2>
                <p>
                  Choose a location to see its sky. Coordinates stay in this
                  page and are never sent to a server.
                </p>
                <button
                  className="primary-button"
                  onClick={locate}
                  disabled={locating}
                >
                  <LocateFixed size={16} />
                  {locating ? "Finding your location…" : "Use my location"}
                </button>
                <div className="city-list">
                  {cities.map((c) => (
                    <button key={c.name} onClick={() => changeLocation(c)}>
                      {c.name}
                      {location.name === c.name ? (
                        <Check size={15} />
                      ) : (
                        <ArrowUpRight size={14} />
                      )}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const latitude = Number(lat),
                      longitude = Number(lon);
                    if (
                      !lat.trim() ||
                      !lon.trim() ||
                      !Number.isFinite(latitude) ||
                      !Number.isFinite(longitude) ||
                      Math.abs(latitude) > 90 ||
                      Math.abs(longitude) > 180
                    ) {
                      setLocationError(
                        "Enter latitude from −90 to 90 and longitude from −180 to 180.",
                      );
                      return;
                    }
                    changeLocation({
                      name: "Custom location",
                      latitude,
                      longitude,
                    });
                  }}
                >
                  <span className="eyebrow">OR ENTER COORDINATES</span>
                  <div className="coordinate-fields">
                    <label>
                      Latitude
                      <input
                        required
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        required
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={lon}
                        onChange={(e) => setLon(e.target.value)}
                      />
                    </label>
                  </div>
                  <button className="secondary-button" type="submit">
                    Update sky <ArrowUpRight size={14} />
                  </button>
                </form>
                {locationError && (
                  <p className="error-message" role="alert">
                    {locationError}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="modal-illustration">
                  <Sparkles size={25} />
                </div>
                <h2 id="modal-title">Your pocket-sized observatory.</h2>
                <p>
                  SkyViewer is a free, open-source map of the sky. Choose a
                  location and time, then explore the stars and our solar
                  system.
                </p>
                <div className="guide-items">
                  <div>
                    <Compass />
                    <span>
                      <strong>Find your bearings</strong>
                      <p>
                        Azimuth is your compass direction: north 0°, east 90°,
                        south 180°, west 270°. Altitude is height above the
                        horizon.
                      </p>
                    </span>
                  </div>
                  <div>
                    <SlidersHorizontal />
                    <span>
                      <strong>Make the sky your own</strong>
                      <p>
                        Drag or use arrow keys to look around. Use + / − to
                        zoom. Search and select an object to center it.
                      </p>
                    </span>
                  </div>
                  <div>
                    <Star />
                    <span>
                      <strong>A map, not a visibility forecast</strong>
                      <p>
                        Positions are calculated with Astronomy Engine and a
                        real star catalog. Clouds, buildings, light pollution,
                        and daylight affect what you can see. Dimmed objects are
                        below the horizon.
                      </p>
                    </span>
                  </div>
                  <div>
                    <Compass />
                    <span>
                      <strong>Phone compass is experimental</strong>
                      <p>
                        Optional on supported HTTPS browsers. Hold the phone
                        flat with its top edge forward. It follows heading only;
                        tilt remains manual. This release has no camera overlay.
                      </p>
                    </span>
                  </div>
                </div>
                <p className="about-small">
                  Times use UTC. Stars are catalog points; planet discs are
                  symbolic. Never use this app to aim optics at the Sun. See the
                  repository for data credits and accuracy limits.
                </p>
                <a
                  className="secondary-button"
                  href="https://github.com/Sancerio/skyviewer-web"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={16} /> Explore the source{" "}
                  <ArrowUpRight size={14} />
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
