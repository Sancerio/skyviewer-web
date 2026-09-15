export type Vector3 = [number, number, number];

export interface Attitude {
  /** Screen-right direction in earth coordinates [east, north, up]. */
  right: Vector3;
  /** Screen-up direction in earth coordinates [east, north, up]. */
  up: Vector3;
  /** Rear-camera look direction in earth coordinates [east, north, up]. */
  forward: Vector3;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const NEAR_PLANE = 1e-9;

/**
 * Converts absolute W3C device-orientation angles to a rear-camera basis.
 *
 * The W3C device frame uses local +X toward the natural-orientation screen's
 * right, +Y toward its top, and +Z out of the display. Its intrinsic rotation
 * order is Z-X'-Y'', represented here by Rz(alpha) Rx(beta) Ry(gamma).
 * Matrix output is interpreted in earth coordinates [east, north, up]. The
 * rear camera faces local -Z.
 *
 * `screenAngle` is the clockwise Screen Orientation angle from the device's
 * natural orientation. A positive `headingOffset` rotates the reported camera
 * heading clockwise; callers can calibrate it independently when a trustworthy
 * compass heading is available.
 *
 * Matrix reference: https://www.w3.org/TR/orientation-event/#worked-example
 */
export function deviceAttitude(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle: number,
  headingOffset = 0,
): Attitude {
  assertFinite({ alpha, beta, gamma, screenAngle, headingOffset });

  // Alpha increases opposite to compass heading, so subtract a clockwise
  // heading correction before constructing the W3C rotation matrix.
  const z = (alpha - headingOffset) * DEG_TO_RAD;
  const x = beta * DEG_TO_RAD;
  const y = gamma * DEG_TO_RAD;
  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  // W3C ZXY rotation from local device axes to the earth reference frame.
  const rotation: [Vector3, Vector3, Vector3] = [
    [cZ * cY - sZ * sX * sY, -cX * sZ, cY * sZ * sX + cZ * sY],
    [cY * sZ + cZ * sX * sY, cZ * cX, sZ * sY - cZ * cY * sX],
    [-cX * sY, sX, cX * cY],
  ];

  const screen = screenAngle * DEG_TO_RAD;
  const cS = Math.cos(screen);
  const sS = Math.sin(screen);

  return {
    right: normalize(transform(rotation, [cS, sS, 0])),
    up: normalize(transform(rotation, [-sS, cS, 0])),
    forward: normalize(transform(rotation, [0, 0, -1])),
  };
}

/** Projects a horizontal sky coordinate through a rear-camera attitude. */
export function projectAR(
  altitude: number,
  azimuth: number,
  attitude: Attitude,
  horizontalFov: number,
  width: number,
  height: number,
): { x: number; y: number; visible: boolean } {
  assertFinite({ altitude, azimuth, horizontalFov, width, height });
  if (altitude < -90 || altitude > 90) {
    throw new RangeError("Altitude must be between -90 and +90 degrees.");
  }
  if (horizontalFov <= 0 || horizontalFov >= 180) {
    throw new RangeError(
      "Horizontal field of view must be between 0 and 180 degrees.",
    );
  }
  if (width <= 0 || height <= 0) {
    throw new RangeError("Projection width and height must be positive.");
  }
  validateAttitude(attitude);

  const alt = altitude * DEG_TO_RAD;
  const az = azimuth * DEG_TO_RAD;
  const cosAlt = Math.cos(alt);
  const sky: Vector3 = [
    cosAlt * Math.sin(az),
    cosAlt * Math.cos(az),
    Math.sin(alt),
  ];
  const cameraX = dot(sky, attitude.right);
  const cameraY = dot(sky, attitude.up);
  const cameraZ = dot(sky, attitude.forward);
  const divisor = cameraZ > NEAR_PLANE ? cameraZ : NEAR_PLANE;
  const focalPixels = width / 2 / Math.tan((horizontalFov * DEG_TO_RAD) / 2);
  const x = width / 2 + (cameraX / divisor) * focalPixels;
  const y = height / 2 - (cameraY / divisor) * focalPixels;
  const visible =
    cameraZ > NEAR_PLANE && x >= 0 && x <= width && y >= 0 && y <= height;

  return { x, y, visible };
}

/**
 * Returns the horizontal FOV visible after a camera video is rendered with
 * `object-fit: cover`.
 *
 * `baseLandscapeHorizontalFov` spans the camera's long image dimension. The
 * actual video dimensions establish its focal length; the cover scale then
 * determines how much source width remains inside the viewport crop.
 */
export function effectiveHorizontalFov(
  baseLandscapeHorizontalFov: number,
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  assertFinite({
    baseLandscapeHorizontalFov,
    videoWidth,
    videoHeight,
    viewportWidth,
    viewportHeight,
  });
  if (baseLandscapeHorizontalFov <= 0 || baseLandscapeHorizontalFov >= 180) {
    throw new RangeError(
      "Base field of view must be between 0 and 180 degrees.",
    );
  }
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    throw new RangeError("Video and viewport dimensions must be positive.");
  }

  const landscapeWidth = Math.max(videoWidth, videoHeight);
  const focalSourcePixels =
    landscapeWidth /
    2 /
    Math.tan((baseLandscapeHorizontalFov * DEG_TO_RAD) / 2);
  const coverScale = Math.max(
    viewportWidth / videoWidth,
    viewportHeight / videoHeight,
  );
  const visibleSourceWidth = viewportWidth / coverScale;

  return 2 * Math.atan(visibleSourceWidth / 2 / focalSourcePixels) * RAD_TO_DEG;
}

function transform(
  rotation: [Vector3, Vector3, Vector3],
  vector: Vector3,
): Vector3 {
  return [
    dot(rotation[0], vector),
    dot(rotation[1], vector),
    dot(rotation[2], vector),
  ];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  return vector.map((value) =>
    Math.abs(value / length) < 1e-15 ? 0 : value / length,
  ) as Vector3;
}

function assertFinite(values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value))
      throw new RangeError(`${name} must be a finite number.`);
  }
}

function validateAttitude(attitude: Attitude): void {
  for (const [name, vector] of Object.entries(attitude) as Array<
    [keyof Attitude, Vector3]
  >) {
    if (
      vector.length !== 3 ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new RangeError(
        `Attitude ${name} must be a finite three-component vector.`,
      );
    }
  }
}
