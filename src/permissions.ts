/** Browser permissions belong to the browser, never to localStorage.
 * Only reuse a successful motion request in this live document. A cold launch
 * has a new module instance and must ask the browser again from a user gesture.
 * https://www.w3.org/TR/permissions/#permission-lifetime
 */
export function createMotionPermissionGate() {
  let granted = false;
  let pending: Promise<PermissionState> | null = null;
  let generation = 0;
  return {
    invalidate() { granted = false; generation++; pending = null; },
    request(request?: () => Promise<PermissionState>): Promise<PermissionState> {
      if (!request || granted) return Promise.resolve("granted");
      if (pending) return pending;
      const token = generation;
      try {
        // Invoke synchronously. An await here would lose iOS user activation.
        const result = request();
        pending = Promise.resolve(result).then(state => {
          if (token === generation) granted = state === "granted";
          return state;
        }).finally(() => { if (token === generation) pending = null; });
        return pending;
      } catch (error) { return Promise.reject(error); }
    },
  };
}
export const motionPermission = createMotionPermissionGate();
export function requestMotion(): Promise<PermissionState> {
  const constructor = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
    requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
  }) | undefined;
  return motionPermission.request(constructor?.requestPermission
    ? () => constructor.requestPermission!(true) : undefined);
}
export type PermissionHint = PermissionState | "unknown";
/** Querying is passive. Unsupported names are unknown, not denied. */
export async function permissionHint(name: "camera" | "geolocation"): Promise<PermissionHint> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    // A buggy query must not leave Help stuck indefinitely.
    return await Promise.race([
      navigator.permissions.query({ name: name as PermissionName }).then(p => p.state),
      new Promise<PermissionHint>(resolve => setTimeout(() => resolve("unknown"), 1000)),
    ]);
  } catch { return "unknown"; }
}
export function isHomeScreen(): boolean {
  return !!(navigator as Navigator & { standalone?: boolean }).standalone ||
    window.matchMedia("(display-mode: standalone)").matches;
}
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
