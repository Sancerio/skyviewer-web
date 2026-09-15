import type { SkyObject } from "./sky";
import { direction } from "./sky";
const planetFacts: Record<string, string> = {
  Sun: "Our star, and the center of the solar system. Its light makes the daytime sky bright. Never aim binoculars or a telescope at it.",
  Moon: "Earth’s natural satellite. Its appearance changes as the Sun illuminates different parts of the side facing Earth.",
  Mercury:
    "The innermost planet. Look for it near the horizon around sunrise or sunset, away from the Sun.",
  Venus:
    "A rocky planet with a thick atmosphere. Often conspicuous as the evening or morning star, it is a planet rather than a star.",
  Mars: "A rocky planet recognizable by its reddish appearance. Its brightness changes significantly as its distance from Earth changes.",
  Jupiter:
    "The largest planet in our solar system. Its four large Galilean moons can be seen with suitable binoculars or a telescope.",
  Saturn:
    "A gas giant surrounded by a system of rings. A telescope is needed to resolve the rings.",
  Uranus:
    "An ice giant in the outer solar system. It is faint and generally requires binoculars or a telescope.",
  Neptune:
    "The most distant planet in our solar system. It is too faint to see with the unaided eye.",
};
export default function ObjectInformation({
  object: o,
}: {
  object: SkyObject;
}) {
  const starId = o.id.startsWith("hip-") ? o.id.slice(4) : null;
  const href = starId
    ? `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP%20${starId}`
    : o.kind === "sun"
      ? "https://science.nasa.gov/sun/"
      : o.kind === "moon"
        ? "https://science.nasa.gov/moon/"
        : `https://science.nasa.gov/${o.name.toLowerCase()}/`;
  return (
    <div className="object-information">
      <p>
        {planetFacts[o.name] ||
          `${o.name} is a cataloged star${o.constellation ? ` in ${o.constellation}` : ""}. Its position here is calculated for your observing location and time.`}
      </p>
      <dl>
        <div>
          <dt>Direction</dt>
          <dd>
            {direction(o.azimuth)} · {o.azimuth.toFixed(1)}°
          </dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>
            {o.altitude.toFixed(1)}° ·{" "}
            {o.altitude >= 0 ? "above horizon" : "below horizon"}
          </dd>
        </div>
        <div>
          <dt>Visual magnitude</dt>
          <dd>{o.magnitude.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Right ascension</dt>
          <dd>{o.ra.toFixed(3)} h</dd>
        </div>
        <div>
          <dt>Declination</dt>
          <dd>{o.dec.toFixed(3)}°</dd>
        </div>
        {starId && (
          <div>
            <dt>Catalog identifier</dt>
            <dd>HIP {starId}</dd>
          </div>
        )}
        {o.distanceAu !== undefined && (
          <div>
            <dt>Distance from observer</dt>
            <dd>
              {o.kind === "moon"
                ? `${Math.round(o.distanceAu * 149597870.7).toLocaleString()} km`
                : `${o.distanceAu.toFixed(3)} AU`}
            </dd>
          </div>
        )}
        {o.colorIndex !== undefined && (
          <div>
            <dt>Color index (B−V)</dt>
            <dd>{o.colorIndex.toFixed(3)}</dd>
          </div>
        )}
        {starId && (
          <div>
            <dt>Stellar distance</dt>
            <dd>Not bundled · see SIMBAD</dd>
          </div>
        )}
      </dl>
      <p className="info-footnote">
        Lower magnitudes mean brighter objects. Above the horizon does not
        guarantee visibility: daylight, clouds and light pollution still matter.
      </p>
      {o.colorIndex !== undefined && (
        <p className="info-footnote">
          B−V compares blue and visual brightness; lower values generally
          indicate a bluer star. Stellar distance and spectral type are
          available via SIMBAD when cataloged.
        </p>
      )}
      <a href={href} target="_blank" rel="noreferrer">
        {starId ? "More in the SIMBAD star database" : "Learn more from NASA"} ↗
      </a>
    </div>
  );
}
