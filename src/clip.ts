export interface ProjectedLinePoint {
  x: number;
  y: number;
  inFront: boolean;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type ClippedLineSegment = [ScreenPoint, ScreenPoint];

/**
 * Clips a projected segment to the canvas with the Liang-Barsky algorithm.
 * Rear-hemisphere endpoints are rejected because their perspective coordinates
 * do not describe a continuous segment on the visible camera plane.
 */
export function clipLineToViewport(
  start: ProjectedLinePoint,
  end: ProjectedLinePoint,
  width: number,
  height: number,
): ClippedLineSegment | null {
  if (
    !start.inFront ||
    !end.inFront ||
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y) ||
    !Number.isFinite(end.x) ||
    !Number.isFinite(end.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let entry = 0;
  let exit = 1;

  for (const [p, q] of [
    [-dx, start.x],
    [dx, width - start.x],
    [-dy, start.y],
    [dy, height - start.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > exit) return null;
      entry = Math.max(entry, ratio);
    } else {
      if (ratio < entry) return null;
      exit = Math.min(exit, ratio);
    }
  }

  return [
    {
      x: entry === 0 ? start.x : clamp(start.x + entry * dx, 0, width),
      y: entry === 0 ? start.y : clamp(start.y + entry * dy, 0, height),
    },
    {
      x: exit === 1 ? end.x : clamp(start.x + exit * dx, 0, width),
      y: exit === 1 ? end.y : clamp(start.y + exit * dy, 0, height),
    },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
