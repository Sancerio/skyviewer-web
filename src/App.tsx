import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LocateFixed, MapPin, X } from "lucide-react";
import CameraAR from "./CameraAR";
import { useObserver } from "./useObserver";
import type { Location } from "./sky";
const cities: Location[] = [
  { name: "Adelaide", latitude: -34.9285, longitude: 138.6007 },
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "London", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York", latitude: 40.7128, longitude: -74.006 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { name: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
  { name: "Reykjavík", latitude: 64.1466, longitude: -21.9426 },
];
export default function App() {
  const observer = useObserver();
  const [modal, setModal] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [formError, setFormError] = useState("");
  const modalClose = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (modal) modalClose.current?.focus(); }, [modal]);
  function closeModal() { observer.cancel(); setModal(false); setFormError(""); }
  function choose(location: Location) { observer.choose(location); setModal(false); setFormError(""); }
  return !modal ? <CameraAR observer={observer} onChangeLocation={() => {
    observer.cancel(); setLat(observer.location ? String(observer.location.latitude) : "");
    setLon(observer.location ? String(observer.location.longitude) : ""); setModal(true);
  }} /> : <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e => {
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab") {
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button,input,a[href]"))
          .filter(el => !el.hasAttribute("disabled"));
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <button ref={modalClose} className="icon-button modal-close" aria-label="Close dialog" onClick={closeModal}><X size={20} /></button>
      <div className="modal-illustration"><MapPin size={25} /></div>
      <h2 id="modal-title">Where are you looking up?</h2>
      <p>Current location is automatic when you start AR. Choose another location only to explore elsewhere or when GPS is unavailable. Coordinates stay in this page.</p>
      <button className="primary-button" onClick={() => observer.request(() => setModal(false))}>
        <LocateFixed size={16} />{observer.status === "loading" ? "Finding your location…" : "Use my location"}</button>
      <div className="city-list">{cities.map(city => <button key={city.name} onClick={() => choose(city)}>{city.name}{observer.location?.name === city.name ? <Check size={15} /> : <ArrowUpRight size={14} />}</button>)}</div>
      <form onSubmit={e => {
        e.preventDefault(); const latitude = Number(lat), longitude = Number(lon);
        if (!lat.trim() || !lon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          setFormError("Enter latitude from −90 to 90 and longitude from −180 to 180."); return;
        }
        choose({ name: "Custom location", latitude, longitude });
      }}>
        <span className="eyebrow">OR ENTER COORDINATES</span><div className="coordinate-fields">
          <label>Latitude<input required type="number" step="any" min="-90" max="90" value={lat} onChange={e => setLat(e.target.value)} /></label>
          <label>Longitude<input required type="number" step="any" min="-180" max="180" value={lon} onChange={e => setLon(e.target.value)} /></label></div>
        <button className="secondary-button" type="submit">Update sky <ArrowUpRight size={14} /></button>
      </form>
      {(formError || observer.error) && <p className="error-message" role="alert">{formError || observer.error}</p>}
    </section>
  </div>;
}
