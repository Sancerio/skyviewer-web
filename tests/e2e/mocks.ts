import { expect, type Page } from "@playwright/test";
export const NOW = new Date("2026-09-19T12:00:00Z");
export type Options = {
  camera?: "success" | "denied" | "pending" | "front" | "unknown";
  permission?: "none" | "granted" | "denied" | "pending";
  location?: "success" | "denied" | "pending" | "timeout";
  playback?: "success" | "denied";
  muted?: boolean; standalone?: boolean; storageBlocked?: boolean;
};
export async function openApp(page: Page, options: Options = {}) {
  await page.addInitScript((o: Options) => {
    const state = {
      cameraRequests: 0, locationRequests: 0, watchRequests: 0, trackStops: 0, playCalls: 0,
      permissionCalls: [] as Array<boolean | undefined>, screenAngle: 0, muted: !!o.muted,
      order: [] as string[], constraints: [] as MediaStreamConstraints[],
      resolveCamera: () => {}, resolveMotion: (_state: PermissionState) => {},
      deliverLocation: (_lat = 1.3521, _lon = 103.8198, _accuracy = 20) => {},
      muteCamera: () => {}, unmuteCamera: () => {}, endCamera: () => {},
      locationMode: o.location ?? "success", playbackMode: o.playback ?? "success", permissionMode: o.permission ?? "none",
    };
    Object.assign(window, { __arMock: state });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "standalone", { configurable: true, value: o.standalone ?? false });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: () => Promise.reject(new TypeError("Unsupported permission name")) } });
    if (o.storageBlocked) Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new DOMException("Storage blocked", "SecurityError"); } });
    const screenOrientation = new EventTarget();
    Object.defineProperty(screenOrientation, "angle", { get: () => state.screenAngle });
    Object.defineProperty(screen, "orientation", { configurable: true, value: screenOrientation });
    const track = new EventTarget() as EventTarget & { label: string; getSettings: () => MediaTrackSettings; stop: () => void };
    track.label = o.camera === "front" ? "Front Camera" : o.camera === "unknown" ? "Integrated Camera" : "Back Camera";
    Object.defineProperty(track, "muted", { get: () => state.muted });
    track.getSettings = () => ({ width: 720, height: 1280, facingMode: o.camera === "front" ? "user" : o.camera === "unknown" ? undefined : "environment" });
    track.stop = () => { state.trackStops++; };
    state.muteCamera = () => { state.muted = true; track.dispatchEvent(new Event("mute")); };
    state.unmuteCamera = () => { state.muted = false; track.dispatchEvent(new Event("unmute")); };
    state.endCamera = () => track.dispatchEvent(new Event("ended"));
    const stream = new MediaStream();
    Object.defineProperties(stream, { getTracks: { value: () => [track] }, getVideoTracks: { value: () => [track] } });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      enumerateDevices: () => Promise.resolve([]), getUserMedia: (constraints: MediaStreamConstraints) => {
        state.cameraRequests++; state.order.push("camera"); state.constraints.push(constraints);
        if (o.camera === "denied") return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (o.camera === "pending") return new Promise(resolve => { state.resolveCamera = () => resolve(stream); });
        return Promise.resolve(stream);
      },
    }});
    class OrientationEvent extends Event {}
    if (o.permission && o.permission !== "none") Object.defineProperty(OrientationEvent, "requestPermission", {
      value: (absolute?: boolean) => {
        state.permissionCalls.push(absolute); state.order.push("motion");
        if (state.permissionMode === "pending") return new Promise(resolve => { state.resolveMotion = resolve; });
        return Promise.resolve(state.permissionMode);
      },
    });
    Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, value: OrientationEvent });
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: function () {
      state.playCalls++;
      if (state.playbackMode === "denied") return Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));
      Object.defineProperties(this, { videoWidth: { configurable: true, value: 720 }, videoHeight: { configurable: true, value: 1280 } });
      queueMicrotask(() => { this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); });
      return Promise.resolve();
    }});
    let initial: PositionCallback | undefined;
    state.deliverLocation = (latitude = 1.3521, longitude = 103.8198, accuracy = 20) => {
      initial?.({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() } as GeolocationPosition);
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback) => {
        state.locationRequests++; state.order.push("location"); initial = success;
        if (state.locationMode === "denied" || state.locationMode === "timeout") queueMicrotask(() => failure({ code: state.locationMode === "denied" ? 1 : 3 } as GeolocationPositionError));
        else if (state.locationMode !== "pending") queueMicrotask(() => state.deliverLocation());
      },
      watchPosition: () => { state.watchRequests++; return 1; }, clearWatch: () => {},
    }});
  }, options);
  await page.clock.install({ time: NOW }); await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Camera AR" }); await expect(dialog).toBeVisible(); return dialog;
}
export async function start(page: Page) {
  await page.locator(".ar-setup .primary-button").click();
}
export async function emit(page: Page, reading: { alpha: number | null; beta: number; gamma: number; absolute: boolean; heading?: number; accuracy?: number }) {
  await page.evaluate(r => {
    const e = new Event(r.absolute ? "deviceorientationabsolute" : "deviceorientation");
    Object.defineProperties(e, { alpha: { value: r.alpha }, beta: { value: r.beta }, gamma: { value: r.gamma }, absolute: { value: r.absolute }, webkitCompassHeading: { value: r.heading }, webkitCompassAccuracy: { value: r.accuracy } });
    window.dispatchEvent(e);
  }, reading); await page.clock.runFor(25);
}
export async function mock(page: Page, expression: string) {
  return page.evaluate(code => Function(`return window.__arMock.${code}`)(), expression);
}
export async function aimAt(page: Page, name: string) {
  if (name === "Saturn") { await page.clock.setSystemTime(new Date(NOW.getTime() + 2 * 60 * 60 * 1000)); await page.clock.runFor(5100); }
  await page.getByRole("button", { name: "Search in camera AR" }).click(); await page.getByLabel("Search AR objects").fill(name);
  const results = page.locator(".ar-results button"), matches = name === "HIP" ? results : results.filter({ hasText: name });
  const button = matches.filter({ hasText: "↑" }).first(); await expect(button).toBeVisible();
  const actualName = (await button.locator("span").first().innerText()).split("\n")[0]; await button.click();
  await page.getByRole("button", { name: "Information ↗" }).click(); const dl = page.locator(".object-information dl");
  const az = Number.parseFloat((await dl.locator("div").filter({ hasText: "Direction" }).locator("dd").innerText()).split("·").at(-1)!);
  const alt = Number.parseFloat(await dl.locator("div").filter({ hasText: "Altitude" }).locator("dd").innerText()); expect(alt).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Close AR information" }).click();
  const correction = Number(await page.locator(".ar-view").getAttribute("data-declination"));
  await emit(page, { alpha: ((360 - az + correction) % 360 + 360) % 360, beta: 90 + alt, gamma: 0, absolute: true }); return actualName;
}
export async function ready(page: Page) {
  await start(page); await expect(page.locator(".ar-header small")).toHaveText("LIVE");
  await emit(page, { alpha: 90, beta: 120, gamma: 0, absolute: true }); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
}
