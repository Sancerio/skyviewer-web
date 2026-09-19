import { expect, test } from "@playwright/test";
import { aimAt, emit, mock, openApp, ready, start } from "./mocks";

test("one gesture sequences motion, location, camera without duplicate GPS requests", async ({ page }) => {
  await openApp(page, { permission: "granted" });
  expect(await mock(page, "cameraRequests")).toBe(0); expect(await mock(page, "locationRequests")).toBe(0);
  await ready(page);
  expect(await mock(page, "order")).toEqual(["motion", "location", "camera"]);
  expect(await mock(page, "permissionCalls")).toEqual([true]); expect(await mock(page, "watchRequests")).toBe(0);
  expect(await mock(page, "constraints[0]")).toEqual({ audio: false, video: { facingMode: { exact: "environment" } } });
});

test("iPhone compass works without calibration and preserves a stationary pose", async ({ page }, info) => {
  const dialog = await openApp(page, { permission: "granted" }); await start(page);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");
  await emit(page, { alpha: 123, beta: 120, gamma: 0, absolute: false, heading: 80, accuracy: 8 });
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect(dialog.locator(".ar-status span").first()).toHaveText("E 80° · altitude 30°");
  await page.clock.runFor(5000); await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect.poll(async () => Number(await dialog.getAttribute("data-rendered-objects"))).toBeGreaterThan(0);
  await info.attach("synthetic-automatic-ar", { body: await page.screenshot(), contentType: "image/png" });
});

for (const name of ["HIP", "Moon", "Saturn"]) test(`renders actual ${name} pixels and supports tap selection`, async ({ page }, info) => {
  await openApp(page); await ready(page); const selected = await aimAt(page, name);
  await expect(page.locator(".ar-bottom")).toContainText(`${selected} is in your view`);
  const canvas = page.locator(".ar-canvas");
  await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => {
    const pixels = el.getContext("2d")!.getImageData(Math.floor(el.width/2)-4, Math.floor(el.height/2)-4, 8, 8).data;
    return Array.from(pixels).filter((_, i) => i % 4 === 3).some(alpha => alpha > 0);
  })).toBe(true);
  expect(await canvas.evaluate(el => getComputedStyle(el).zIndex)).toBe("1");
  const box = (await canvas.boundingBox())!; await canvas.tap({ position: { x: box.width/2, y: box.height/2 } });
  await expect(page.locator(".ar-sheet-title h2")).toHaveText(selected);
  await info.attach(`synthetic-${name}`, { body: await page.screenshot(), contentType: "image/png" });
});

test("equivalent landscape pose retains heading", async ({ page }) => {
  await openApp(page); await ready(page); await emit(page, { alpha: 0, beta: 90, gamma: 0, absolute: true });
  const value = await page.locator(".ar-status span").first().innerText();
  await mock(page, "screenAngle = 90"); await page.evaluate(() => screen.orientation.dispatchEvent(new Event("change")));
  await emit(page, { alpha: 90, beta: 0, gamma: -90, absolute: true }); await expect(page.locator(".ar-status span").first()).toHaveText(value);
});

test("stop/start reuses same-document motion and a recent location fix", async ({ page }) => {
  await openApp(page, { permission: "granted" }); await ready(page);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click(); await ready(page);
  expect(await mock(page, "permissionCalls")).toEqual([true]); expect(await mock(page, "locationRequests")).toBe(1);
  expect(await mock(page, "cameraRequests")).toBe(2); expect(await mock(page, "trackStops")).toBe(1);
});

test("changing place or opening Help does not restart a live camera", async ({ page }) => {
  await openApp(page, { permission: "granted" }); await ready(page);
  await page.getByRole("button", { name: "Sky display settings" }).click(); await page.getByRole("button", { name: "Change observing location" }).click();
  await page.getByRole("button", { name: "Sydney", exact: true }).click();
  await expect(page.locator(".ar-status")).toContainText("Sydney");
  await page.getByRole("button", { name: "Close display settings" }).click();
  await page.getByRole("button", { name: "Help with access", exact: true }).click(); await page.getByRole("button", { name: "Close help" }).click();
  expect(await mock(page, "cameraRequests")).toBe(1); expect(await mock(page, "trackStops")).toBe(0);
  expect(await mock(page, "permissionCalls")).toEqual([true]);
});

for (const event of ["pagehide", "visibilitychange"]) test(`${event} releases camera and resumes without resetting setup`, async ({ page }, info) => {
  await openApp(page, { permission: "granted", standalone: true }); await ready(page);
  await page.evaluate(event => {
    if (event === "visibilitychange") { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event(event)); }
    else window.dispatchEvent(new Event(event));
  }, event);
  expect(await mock(page, "trackStops")).toBe(1);
  await expect(page.getByRole("button", { name: "Resume stargazing" })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pageshow")); });
  expect(await mock(page, "cameraRequests")).toBe(1);
  await info.attach(`synthetic-${event}-resume`, { body: await page.screenshot(), contentType: "image/png" });
  await ready(page); expect(await mock(page, "permissionCalls")).toEqual([true]); expect(await mock(page, "locationRequests")).toBe(1);
});

test("an old location fix is refreshed on restart rather than silently reused", async ({ page }) => {
  await openApp(page, { permission: "granted" }); await ready(page);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click(); await page.clock.runFor(5 * 60000 + 1000); await ready(page);
  expect(await mock(page, "locationRequests")).toBe(2); expect(await mock(page, "permissionCalls")).toEqual([true]);
});

test("cold launch remembers onboarding but not OS permission grants", async ({ page }, info) => {
  await openApp(page, { permission: "granted", standalone: true }); await ready(page); await page.reload();
  await expect(page.getByText("WELCOME BACK", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open camera", exact: true })).toBeVisible();
  expect(await mock(page, "cameraRequests")).toBe(0); expect(await mock(page, "permissionCalls")).toEqual([]);
  await info.attach("synthetic-returning-home-screen", { body: await page.screenshot(), contentType: "image/png" });
  await ready(page); expect(await mock(page, "permissionCalls")).toEqual([true]);
});

test("saving a place is opt-in, labelled, used without GPS, and removable", async ({ page }) => {
  await openApp(page, { permission: "granted" }); await ready(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("skyviewer-web.preferences.v1")!).savedPlace)).toBeNull();
  await page.getByRole("button", { name: "Sky display settings" }).click(); await page.getByRole("button", { name: "Save observing place", exact: true }).click();
  await page.getByLabel("Faintest AR stars").fill("4"); await page.reload();
  await expect(page.locator(".ar-location")).toContainText("Saved place, not live GPS"); await ready(page);
  expect(await mock(page, "locationRequests")).toBe(0);
  await page.getByRole("button", { name: "Sky display settings" }).click(); await expect(page.getByLabel("Faintest AR stars")).toHaveValue("4");
  await page.getByRole("button", { name: "Forget saved place" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("skyviewer-web.preferences.v1")!).savedPlace)).toBeNull();
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(page.locator(".ar-status")).toContainText("Your location"); expect(await mock(page, "cameraRequests")).toBe(1); expect(await mock(page, "locationRequests")).toBe(1);
});

test("retrying motion never reacquires the camera or location", async ({ page }) => {
  await openApp(page, { permission: "granted" }); await start(page); await expect(page.locator(".ar-header small")).toHaveText("LIVE");
  await page.clock.runFor(8100); await expect(page.locator(".ar-callout")).toContainText("We are not receiving motion yet");
  await page.getByRole("button", { name: "Retry motion", exact: true }).click();
  expect(await mock(page, "cameraRequests")).toBe(1); expect(await mock(page, "locationRequests")).toBe(1); expect(await mock(page, "permissionCalls")).toEqual([true, true]);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true }); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
});

test("denied motion does not request location or camera and supports explicit retry", async ({ page }) => {
  await openApp(page, { permission: "denied" }); await start(page); await expect(page.getByRole("alert")).toContainText("Motion access is off");
  expect(await mock(page, "locationRequests")).toBe(0); expect(await mock(page, "cameraRequests")).toBe(0);
  await mock(page, "permissionMode = 'granted'"); await ready(page); expect(await mock(page, "permissionCalls")).toEqual([true, true]);
});

for (const location of ["denied", "timeout"] as const) test(`${location} GPS has a recovery path and no unnecessary camera request`, async ({ page }) => {
  await openApp(page, { location, permission: "granted" }); await start(page);
  await expect(page.getByRole("alert")).toContainText(location === "denied" ? "Location access is off" : "taking longer than usual");
  expect(await mock(page, "cameraRequests")).toBe(0);
  await mock(page, "locationMode = 'success'"); await ready(page);
  expect(await mock(page, "permissionCalls")).toEqual([true]); expect(await mock(page, "locationRequests")).toBe(2);
});

test("location progress is specific and cancellation invalidates late GPS", async ({ page }) => {
  await openApp(page, { location: "pending", permission: "granted" }); await start(page);
  await expect(page.locator(".startup-progress")).toContainText("Finding your location"); expect(await mock(page, "cameraRequests")).toBe(0);
  await page.getByRole("button", { name: "Cancel setup" }).click(); await mock(page, "deliverLocation(0, 0)");
  await expect(page.locator(".ar-location")).toContainText("Use your current location"); expect(await mock(page, "cameraRequests")).toBe(0);
});

test("late camera streams are stopped after cancelling setup", async ({ page }) => {
  await openApp(page, { camera: "pending" }); await start(page); await expect(page.locator(".startup-progress")).toContainText("Opening camera");
  await page.getByRole("button", { name: "Cancel setup" }).click(); await mock(page, "resolveCamera()"); await expect.poll(() => mock(page, "trackStops")).toBe(1);
});

test("cancelled motion request never advances to location or camera", async ({ page }) => {
  await openApp(page, { permission: "pending" }); await start(page); await expect(page.locator(".startup-progress")).toContainText("Enabling motion");
  await page.getByRole("button", { name: "Cancel setup" }).click(); await mock(page, "resolveMotion('granted')");
  expect(await mock(page, "locationRequests")).toBe(0); expect(await mock(page, "cameraRequests")).toBe(0);
});

test("keeps orientation that arrives during a slow camera request", async ({ page }) => {
  await openApp(page, { camera: "pending" }); await start(page); await expect(page.locator(".startup-progress")).toContainText("Opening camera");
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true }); await mock(page, "resolveCamera()"); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
});

for (const camera of ["denied", "front", "unknown"] as const) test(`${camera} camera explains the next action and offers a labelled map`, async ({ page }) => {
  await openApp(page, { camera }); await start(page);
  await expect(page.getByRole("alert")).toContainText(camera === "denied" ? "Camera access is off" : "No rear camera found");
  if (camera !== "denied") expect(await mock(page, "trackStops")).toBe(1);
  await page.getByRole("button", { name: "Explore without camera", exact: true }).click(); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".ar-accuracy")).toContainText("not camera-aligned"); const canvas = page.getByLabel("Sky map: drag or use arrow keys to explore");
  await canvas.focus(); await canvas.press("ArrowRight"); await expect(page.locator(".ar-status span").first()).toHaveText("N 5° · altitude 35°");
});

test("relative-only or invalid compass data is not treated as north", async ({ page }) => {
  await openApp(page); await start(page); await expect(page.locator(".ar-header small")).toHaveText("LIVE");
  await emit(page, { alpha: 90, beta: 120, gamma: 0, absolute: false, heading: 0, accuracy: -1 });
  await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "false"); await expect(page.locator(".ar-callout")).toContainText("We cannot find north yet");
});

test("playback retry uses the existing stream, not another permission request", async ({ page }) => {
  await openApp(page, { playback: "denied", permission: "granted" }); await start(page);
  await expect(page.getByRole("button", { name: "Resume preview" })).toBeVisible(); await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "false"); await mock(page, "playbackMode = 'success'");
  await page.getByRole("button", { name: "Resume preview" }).click(); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
  expect(await mock(page, "cameraRequests")).toBe(1); expect(await mock(page, "permissionCalls")).toEqual([true]);
});

test("mute pauses overlays and unmute resumes without setup", async ({ page }) => {
  await openApp(page); await ready(page); await mock(page, "muteCamera()"); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "false");
  await mock(page, "unmuteCamera()"); await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true"); expect(await mock(page, "cameraRequests")).toBe(1);
});

test("ended camera produces reconnect messaging and releases tracks", async ({ page }) => {
  await openApp(page); await ready(page); await mock(page, "endCamera()"); await expect(page.getByRole("alert")).toContainText("camera was interrupted");
  expect(await mock(page, "trackStops")).toBe(1); await expect(page.getByRole("button", { name: "Reconnect camera" })).toBeVisible();
});

test("blocked storage cannot prevent startup or pretend settings were saved", async ({ page }) => {
  await openApp(page, { storageBlocked: true }); await ready(page); await page.getByRole("button", { name: "Sky display settings" }).click();
  await page.getByRole("button", { name: "Save observing place", exact: true }).click(); await expect(page.getByRole("status")).toContainText("could not save");
});
