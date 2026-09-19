import { expect, type Page } from "@playwright/test";
export const NOW = new Date("2026-09-19T12:00:00Z");
export type Options = {
  camera?: "success" | "denied" | "pending" | "front" | "unknown";
  permission?: "none" | "granted" | "denied";
  location?: "success" | "denied" | "pending";
  playback?: "success" | "denied";
  muted?: boolean;
};
export async function openApp(page: Page, options: Options = {}) {
  await page.addInitScript((o: Options) => {
    const state = {
      cameraRequests: 0, locationRequests: 0, watchStops: 0, trackStops: 0,
      permissionCalls: [] as Array<boolean | undefined>, screenAngle: 0, muted: !!o.muted,
      constraints: [] as MediaStreamConstraints[], resolveCamera: () => {},
      deliverLocation: (_lat = 1.3521, _lon = 103.8198, _accuracy = 20) => {},
      muteCamera: () => {}, unmuteCamera: () => {}, endCamera: () => {},
    };
    Object.assign(window, { __arMock: state });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
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
      enumerateDevices: () => Promise.resolve([]),
      getUserMedia: (constraints: MediaStreamConstraints) => {
        state.cameraRequests++; state.constraints.push(constraints);
        if (o.camera === "denied") return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (o.camera === "pending") return new Promise(resolve => { state.resolveCamera = () => resolve(stream); });
        return Promise.resolve(stream);
      },
    }});
    class OrientationEvent extends Event {}
    if (o.permission && o.permission !== "none") Object.defineProperty(OrientationEvent, "requestPermission", {
      value: (absolute?: boolean) => { state.permissionCalls.push(absolute); return Promise.resolve(o.permission); },
    });
    Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, value: OrientationEvent });
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: function () {
      if (o.playback === "denied") return Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));
      Object.defineProperties(this, { videoWidth: { configurable: true, value: 720 }, videoHeight: { configurable: true, value: 1280 } });
      queueMicrotask(() => { this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); });
      return Promise.resolve();
    }});
    let initial: PositionCallback | undefined, watcher: PositionCallback | undefined;
    state.deliverLocation = (latitude = 1.3521, longitude = 103.8198, accuracy = 20) => {
      const position = { coords: { latitude, longitude, accuracy }, timestamp: Date.now() } as GeolocationPosition;
      initial?.(position); watcher?.(position);
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback) => {
        state.locationRequests++; initial = success;
        if (o.location === "denied") queueMicrotask(() => failure({ code: 1 } as GeolocationPositionError));
        else if (o.location !== "pending") queueMicrotask(() => state.deliverLocation());
      },
      watchPosition: (success: PositionCallback) => { watcher = success; return 1; },
      clearWatch: () => { watcher = undefined; state.watchStops++; },
    }});
  }, options);
  await page.clock.install({ time: NOW });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Camera AR" });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function start(page: Page) {
  await page.getByRole("button", { name: /^Start AR/ }).click();
}
export async function emit(page: Page, reading: { alpha: number | null; beta: number; gamma: number; absolute: boolean; heading?: number; accuracy?: number }) {
  await page.evaluate(r => {
    const e = new Event(r.absolute ? "deviceorientationabsolute" : "deviceorientation");
    Object.defineProperties(e, { alpha: { value: r.alpha }, beta: { value: r.beta }, gamma: { value: r.gamma }, absolute: { value: r.absolute },
      webkitCompassHeading: { value: r.heading }, webkitCompassAccuracy: { value: r.accuracy } });
    window.dispatchEvent(e);
  }, reading);
  await page.clock.runFor(25);
}
export async function mock(page: Page, expression: string) {
  // Test-only access to functions installed in this controlled browser harness.
  return page.evaluate(code => Function(`return window.__arMock.${code}`)(), expression);
}
export async function aimAt(page: Page, name: string) {
  // Saturn is just below Singapore's horizon at the shared fixture time.
  // Advance the real ephemeris, rather than changing its coordinates or drawing
  // a physically hidden planet merely to make a screenshot assertion pass.
  if (name === "Saturn") {
    await page.clock.setSystemTime(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
    await page.clock.runFor(5100);
  }
  await page.getByRole("button", { name: "Search in camera AR" }).click();
  await page.getByLabel("Search AR objects").fill(name);
  const results = page.locator(".ar-results button");
  // HIP is a searchable catalog alias; bright stars display their proper names.
  const matches = name === "HIP" ? results : results.filter({ hasText: name });
  const button = matches.filter({ hasText: "↑" }).first();
  await expect(button).toBeVisible();
  const actualName = (await button.locator("span").first().innerText()).split("\n")[0];
  await button.click();
  await page.getByRole("button", { name: "Information ↗" }).click();
  const dl = page.locator(".object-information dl");
  const az = Number.parseFloat((await dl.locator("div").filter({ hasText: "Direction" }).locator("dd").innerText()).split("·").at(-1)!);
  const alt = Number.parseFloat(await dl.locator("div").filter({ hasText: "Altitude" }).locator("dd").innerText());
  expect(alt).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Close AR information" }).click();
  const correction = Number(await page.locator(".ar-view").getAttribute("data-declination"));
  await emit(page, { alpha: ((360 - az + correction) % 360 + 360) % 360, beta: 90 + alt, gamma: 0, absolute: true });
  return actualName;
}
