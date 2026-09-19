/** The public W3C angles are relative on iOS even when its compass is available. */
export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
  absolute: boolean;
  reference: "webkit" | "absolute" | "relative";
  accuracy?: number;
}
export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  type?: string;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}
export const wrap360 = (angle: number) => ((angle % 360) + 360) % 360;
export const wrap180 = (angle: number) => wrap360(angle + 180) - 180;

/** Never interpret an arbitrary relative yaw, null, or an invalid compass as north. */
export function normalizeOrientation(reading: OrientationReading): OrientationSample | null {
  const { alpha, beta, gamma } = reading;
  if (alpha === null || beta === null || gamma === null ||
      ![alpha, beta, gamma].every(Number.isFinite)) return null;
  const heading = reading.webkitCompassHeading;
  const accuracy = reading.webkitCompassAccuracy;
  const hasCompass = typeof heading === "number" && Number.isFinite(heading) &&
    heading >= 0 && heading <= 360 &&
    (accuracy === undefined || (Number.isFinite(accuracy) && accuracy >= 0));
  if (hasCompass) {
    // Compass bearings increase clockwise; W3C alpha increases anticlockwise.
    // Keep beta/gamma intact so the existing rear-camera matrix handles tilt/roll.
    return { alpha: wrap360(360 - heading), beta, gamma, absolute: true,
      reference: "webkit", ...(accuracy === undefined ? {} : { accuracy }) };
  }
  const absolute = reading.absolute === true || reading.type === "deviceorientationabsolute";
  return { alpha: wrap360(alpha), beta, gamma, absolute,
    reference: absolute ? "absolute" : "relative" };
}
