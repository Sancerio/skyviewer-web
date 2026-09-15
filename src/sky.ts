import {
  Body,
  Equator,
  EquatorFromVector,
  Horizon,
  Illumination,
  Observer,
  RotateVector,
  Rotation_EQJ_EQD,
  Spherical,
  VectorFromSphere,
} from "astronomy-engine";

import constellationData from "./data/constellations.json";
import constellationLineData from "./data/constellations.lines.json";
import catalog from "./data/catalog.json";

export interface SkyObject {
  id: string;
  name: string;
  kind: "star" | "planet" | "moon" | "sun";
  /** Right ascension of date, in sidereal hours from 0 (inclusive) to 24 (exclusive). */
  ra: number;
  /** Declination of date, in degrees from -90 to +90. */
  dec: number;
  /** Geometric altitude above the local horizon, in degrees. */
  altitude: number;
  /** Azimuth in degrees clockwise from north. */
  azimuth: number;
  magnitude: number;
  constellation?: string;
}

export interface Location {
  name: string;
  /** Degrees north of the equator. */
  latitude: number;
  /** Degrees east of Greenwich. */
  longitude: number;
}

export interface ConstellationLine {
  name: string;
  points: Array<Array<{ altitude: number; azimuth: number }>>;
}

interface StarFeature {
  id: number;
  properties: { mag: number };
  geometry: { coordinates: [number, number] };
}

interface StarName {
  name?: string;
  bayer?: string;
  flam?: string;
  hip?: string;
  c?: string;
}

interface ConstellationFeature {
  id: string;
  properties: { name?: string; en?: string };
}

interface ConstellationLineFeature {
  id: string;
  geometry: { coordinates: Array<Array<[number, number]>> };
}

interface CatalogStar {
  id: number;
  ra: number;
  dec: number;
  magnitude: number;
  name: string;
  constellation?: string;
}

const DEG_TO_RAD = Math.PI / 180;
const PROJECTION_EPSILON = 1e-9;

const constellationNames = new Map(
  (constellationData.features as ConstellationFeature[]).map((feature) => [
    feature.id,
    feature.id === "Ser"
      ? "Serpens"
      : feature.properties.name || feature.properties.en || feature.id,
  ]),
);

const starNames = catalog.starNames as Record<string, StarName>;

const catalogStars: CatalogStar[] = (
  catalog.stars as unknown as StarFeature[]
).map((feature) => {
  const metadata = starNames[String(feature.id)];
  const abbreviation = metadata?.c;
  const designation = metadata?.bayer || metadata?.flam;
  const name =
    metadata?.name ||
    (designation && abbreviation
      ? `${designation} ${abbreviation}`
      : undefined) ||
    metadata?.hip?.replace("\u2009", " ") ||
    `HIP ${feature.id}`;

  return {
    id: feature.id,
    ra: longitudeToRa(feature.geometry.coordinates[0]),
    dec: feature.geometry.coordinates[1],
    magnitude: feature.properties.mag,
    name,
    constellation: abbreviation
      ? (constellationNames.get(abbreviation) ?? abbreviation)
      : undefined,
  };
});

const lineCatalog = (() => {
  const merged = new Map<string, Array<Array<[number, number]>>>();

  for (const feature of constellationLineData.features as unknown as ConstellationLineFeature[]) {
    const existing = merged.get(feature.id) ?? [];
    existing.push(...feature.geometry.coordinates);
    merged.set(feature.id, existing);
  }

  return [...merged].map(([id, points]) => ({
    id,
    name: constellationNames.get(id) ?? id,
    points,
  }));
})();

const solarSystemBodies: ReadonlyArray<{
  body: Body;
  kind: "planet" | "moon" | "sun";
}> = [
  { body: Body.Sun, kind: "sun" },
  { body: Body.Moon, kind: "moon" },
  { body: Body.Mercury, kind: "planet" },
  { body: Body.Venus, kind: "planet" },
  { body: Body.Mars, kind: "planet" },
  { body: Body.Jupiter, kind: "planet" },
  { body: Body.Saturn, kind: "planet" },
  { body: Body.Uranus, kind: "planet" },
  { body: Body.Neptune, kind: "planet" },
];

/** Returns catalog stars through magnitude 6, the Sun, the Moon, and seven planets. */
export function getSky(date: Date, location: Location): SkyObject[] {
  validateDate(date);
  const observer = makeObserver(location);
  const rotation = Rotation_EQJ_EQD(date);

  const stars = catalogStars.map((star): SkyObject => {
    const j2000 = VectorFromSphere(
      new Spherical(star.dec, star.ra * 15, 1),
      date,
    );
    const equatorial = EquatorFromVector(RotateVector(rotation, j2000));
    const horizontal = Horizon(date, observer, equatorial.ra, equatorial.dec);

    return {
      id: `hip-${star.id}`,
      name: star.name,
      kind: "star",
      ra: equatorial.ra,
      dec: equatorial.dec,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude: star.magnitude,
      constellation: star.constellation,
    };
  });

  const bodies = solarSystemBodies.map(({ body, kind }): SkyObject => {
    const equatorial = Equator(body, date, observer, true, true);
    const horizontal = Horizon(date, observer, equatorial.ra, equatorial.dec);

    return {
      id: body.toLowerCase(),
      name: body,
      kind,
      ra: equatorial.ra,
      dec: equatorial.dec,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude: Illumination(body, date).mag,
    };
  });

  return [...bodies, ...stars].sort((a, b) => a.magnitude - b.magnitude);
}

/** Returns all 88 western constellation figures in horizontal coordinates. */
export function getConstellationLines(
  date: Date,
  location: Location,
): ConstellationLine[] {
  validateDate(date);
  const observer = makeObserver(location);
  const rotation = Rotation_EQJ_EQD(date);

  return lineCatalog.map((constellation) => ({
    name: constellation.name,
    points: constellation.points.map((line) =>
      line.map(([longitude, dec]) => {
        const j2000 = VectorFromSphere(
          new Spherical(dec, longitudeToRa(longitude) * 15, 1),
          date,
        );
        const equatorial = EquatorFromVector(RotateVector(rotation, j2000));
        const horizontal = Horizon(
          date,
          observer,
          equatorial.ra,
          equatorial.dec,
        );

        return {
          altitude: horizontal.altitude,
          azimuth: horizontal.azimuth,
        };
      }),
    ),
  }));
}

export function getSunAltitude(date: Date, location: Location): number {
  validateDate(date);
  const observer = makeObserver(location);
  const equatorial = Equator(Body.Sun, date, observer, true, true);
  return Horizon(date, observer, equatorial.ra, equatorial.dec).altitude;
}

/** Converts azimuth to the nearest of eight compass points. */
export function direction(azimuth: number): string {
  if (!Number.isFinite(azimuth)) {
    throw new RangeError("Azimuth must be a finite number.");
  }

  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((azimuth % 360) + 360) % 360;
  return compass[Math.round(normalized / 45) % compass.length];
}

/**
 * Projects a horizontal sky coordinate onto a perspective view.
 * `fov` is the horizontal field of view in degrees. Points outside the camera
 * rectangle or on the rear hemisphere return finite coordinates and `visible: false`.
 */
export function project(
  altitude: number,
  azimuth: number,
  centerAz: number,
  centerAlt: number,
  fov: number,
  width: number,
  height: number,
): { x: number; y: number; visible: boolean; inFront: boolean } {
  validateAltitude(altitude, "Altitude");
  validateAltitude(centerAlt, "Center altitude");
  for (const [label, value] of [
    ["Azimuth", azimuth],
    ["Center azimuth", centerAz],
  ] as const) {
    if (!Number.isFinite(value))
      throw new RangeError(`${label} must be a finite number.`);
  }
  if (!Number.isFinite(fov) || fov <= 0 || fov >= 180) {
    throw new RangeError(
      "Field of view must be greater than 0 and less than 180 degrees.",
    );
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      "Projection width and height must be positive finite numbers.",
    );
  }

  const alt = altitude * DEG_TO_RAD;
  const az = azimuth * DEG_TO_RAD;
  const viewAlt = centerAlt * DEG_TO_RAD;
  const viewAz = centerAz * DEG_TO_RAD;

  const cosAlt = Math.cos(alt);
  const point = [cosAlt * Math.sin(az), cosAlt * Math.cos(az), Math.sin(alt)];
  const forward = [
    Math.cos(viewAlt) * Math.sin(viewAz),
    Math.cos(viewAlt) * Math.cos(viewAz),
    Math.sin(viewAlt),
  ];
  const right = [Math.cos(viewAz), -Math.sin(viewAz), 0];
  const up = [
    -Math.sin(viewAlt) * Math.sin(viewAz),
    -Math.sin(viewAlt) * Math.cos(viewAz),
    Math.cos(viewAlt),
  ];

  const cameraX = dot(point, right);
  const cameraY = dot(point, up);
  const cameraZ = dot(point, forward);
  const divisor = cameraZ > PROJECTION_EPSILON ? cameraZ : PROJECTION_EPSILON;
  const scale = width / 2 / Math.tan((fov * DEG_TO_RAD) / 2);
  const x = width / 2 + (cameraX / divisor) * scale;
  const y = height / 2 - (cameraY / divisor) * scale;
  const inFront = cameraZ > PROJECTION_EPSILON;
  const visible = inFront && x >= 0 && x <= width && y >= 0 && y <= height;

  return { x, y, visible, inFront };
}

function longitudeToRa(longitude: number): number {
  return (((longitude % 360) + 360) % 360) / 15;
}

function makeObserver(location: Location): Observer {
  if (
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    throw new RangeError("Latitude must be between -90 and +90 degrees.");
  }
  if (
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new RangeError("Longitude must be between -180 and +180 degrees.");
  }
  return new Observer(location.latitude, location.longitude, 0);
}

function validateDate(date: Date): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError("Date must be valid.");
  }
}

function validateAltitude(value: number, label: string): void {
  if (!Number.isFinite(value) || value < -90 || value > 90) {
    throw new RangeError(`${label} must be between -90 and +90 degrees.`);
  }
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
