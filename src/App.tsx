import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LocateFixed, MapPin, X } from "lucide-react";
import CameraAR from "./CameraAR";
import type { Location } from "./sky";
const cities: Location[] = [
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "London", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York", latitude: 40.7128, longitude: -74.006 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { name: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
  { name: "Reykjavík", latitude: 64.1466, longitude: -21.9426 },
];
export default function App() {
  const [location, setLocation] = useState<Location>(cities[0]);
  const [modal, setModal] = useState<"location" | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [lat, setLat] = useState("1.3521");
  const [lon, setLon] = useState("103.8198");
  const [locationError, setLocationError] = useState("");
  const locationRequest = useRef(0);
  const modalClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modal) modalClose.current?.focus();
  }, [modal]);
  useEffect(
    () => () => {
      locationRequest.current += 1;
    },
    [],
  );
  function closeModal() {
    locationRequest.current += 1;
    setLocating(false);
    setModal(null);
  }
  function changeLocation(l: Location) {
    setLocation(l);
    setLat(String(l.latitude));
    setLon(String(l.longitude));
    setLocationError("");
    closeModal();
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationError(
        "Location is unavailable in this browser. Choose a city or enter coordinates.",
      );
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        changeLocation({
          name: "Your location",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
      },
      () => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setLocationError(
          "Location could not be accessed. Choose a city or enter coordinates instead.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  return (
    <>
      {!modal && (
        <CameraAR
          key={sessionKey}
          location={location}
          onClose={() => setSessionKey((key) => key + 1)}
          onChangeLocation={() => setModal("location")}
        />
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") closeModal();
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
              onClick={closeModal}
            >
              <X size={20} />
            </button>
            <>
              <div className="modal-illustration">
                <MapPin size={25} />
              </div>
              <h2 id="modal-title">Where are you looking up?</h2>
              <p>
                Choose a location to see its sky. Coordinates stay in this page
                and are never sent to a server.
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
          </section>
        </div>
      )}
    </>
  );
}
