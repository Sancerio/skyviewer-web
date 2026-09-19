import { expect, test } from "@playwright/test";
import { aimAt, emit, mock, openApp, start } from "./mocks";

test("one start gesture requests GPS, rear camera and iOS permission without a picker", async ({ page }) => {
  const dialog = await openApp(page, { permission: "granted" });
  expect(await mock(page, "cameraRequests")).toBe(0); expect(await mock(page, "locationRequests")).toBe(0);
  await expect(dialog.locator(".ar-location")).not.toContainText("Singapore");
  await start(page);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");
  expect(await mock(page, "permissionCalls")).toEqual([true]);
  expect(await mock(page, "constraints[0]")).toEqual({ audio: false, video: { facingMode: { exact: "environment" } } });
  expect(await mock(page, "locationRequests")).toBe(1);
  await expect(dialog.locator(".ar-status")).toContainText("Your location");
  await expect(page.getByText("Where are you looking up?", { exact: true })).toHaveCount(0);
});

test("iPhone compass enables tilted AR directly, without manual calibration", async ({ page }, info) => {
  const dialog = await openApp(page, { permission: "granted" }); await start(page);
  await emit(page, { alpha: 123, beta: 120, gamma: 0, absolute: false, heading: 80, accuracy: 8 });
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect(dialog.locator(".ar-status span").first()).toHaveText("E 80° · altitude 30°");
  await expect(dialog.locator(".ar-accuracy")).toContainText("iPhone compass");
  await expect(dialog.locator(".ar-accuracy")).toContainText("true north");
  await expect(page.getByRole("button", { name: /calibrate|flat-phone|direction to north/i })).toHaveCount(0);
  await expect.poll(async () => Number(await dialog.getAttribute("data-rendered-objects"))).toBeGreaterThan(0);
  await info.attach("automatic-iphone-ar", { body: await page.screenshot(), contentType: "image/png" });
});

test("keeps a valid stationary pose rather than erasing stars after three seconds", async ({ page }) => {
  const dialog = await openApp(page); await start(page);
  await emit(page, { alpha: 90, beta: 120, gamma: 0, absolute: true });
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await page.clock.runFor(5000);
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect(dialog.locator(".ar-status span").first()).toHaveText("W 270° · altitude 30°");
});

for (const name of ["HIP", "Moon", "Saturn"]) test(`renders and selects a correctly projected ${name} using current ephemerides`, async ({ page }, info) => {
  const dialog = await openApp(page); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  const selected = await aimAt(page, name);
  await expect(page.locator(".ar-bottom")).toContainText(`${selected} is in your view`);
  const canvas = page.locator(".ar-canvas");
  // Assert actual rasterised object pixels, not only a UI label or object count.
  await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")!;
    const pixels = ctx.getImageData(Math.floor(el.width/2)-4, Math.floor(el.height/2)-4, 8, 8).data;
    return Array.from(pixels).filter((_, i) => i % 4 === 3).some(alpha => alpha > 0);
  })).toBe(true);
  expect(await canvas.evaluate(el => getComputedStyle(el).zIndex)).toBe("1");
  const box = (await canvas.boundingBox())!;
  await canvas.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator(".ar-sheet-title h2")).toHaveText(selected);
  await info.attach(`projected-${name}`, { body: await page.screenshot(), contentType: "image/png" });
  await expect(dialog).toHaveAttribute("data-ready", "true");
});

test("preserves camera direction in an equivalent landscape pose", async ({ page }) => {
  const dialog = await openApp(page); await start(page);
  await emit(page, { alpha: 0, beta: 90, gamma: 0, absolute: true });
  const portrait = await dialog.locator(".ar-status span").first().innerText();
  await mock(page, "screenAngle = 90");
  await page.evaluate(() => screen.orientation.dispatchEvent(new Event("change")));
  await emit(page, { alpha: 90, beta: 0, gamma: -90, absolute: true });
  await expect(dialog.locator(".ar-status span").first()).toHaveText(portrait);
});

test("updates a GPS fix and north correction without reopening a location picker", async ({ page }) => {
  const dialog = await openApp(page); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await mock(page, "deliverLocation(-34.9285, 138.6007, 5)");
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect.poll(async () => Number(await dialog.getAttribute("data-declination"))).toBeGreaterThan(8);
  await expect(dialog.locator(".ar-status")).toContainText("GPS ±5 m");
});

test("starts capturing orientation before a slow camera permission completes", async ({ page }) => {
  const dialog = await openApp(page, { camera: "pending" }); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await mock(page, "resolveCamera()");
  await expect(dialog).toHaveAttribute("data-ready", "true");
});

test("denied iOS motion permission never starts a camera", async ({ page }) => {
  await openApp(page, { permission: "denied" }); await start(page);
  await expect(page.getByRole("alert")).toContainText("Motion and orientation access was denied");
  expect(await mock(page, "cameraRequests")).toBe(0);
  await expect(page.getByRole("button", { name: /^Start AR/ })).toBeEnabled();
});

for (const camera of ["denied", "front", "unknown"] as const) test(`handles ${camera} camera with a retry and an honest sky-map fallback`, async ({ page }) => {
  const dialog = await openApp(page, { camera }); await start(page);
  await expect(page.getByRole("alert")).toContainText(camera === "denied" ? "Rear-camera access was denied" : "A rear camera could not be found");
  if (camera !== "denied") expect(await mock(page, "trackStops")).toBe(1);
  await page.getByRole("button", { name: "Explore sky map instead" }).click();
  await expect(dialog).toHaveAttribute("data-mode", "map");
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect(dialog.locator(".ar-accuracy")).toContainText("not camera-aligned");
  const canvas = page.getByLabel("Sky map: drag or use arrow keys to explore");
  await canvas.focus(); await canvas.press("ArrowRight");
  await expect(dialog.locator(".ar-status span").first()).toHaveText("N 5° · altitude 35°");
});

test("GPS denial cannot silently show the Singapore sky", async ({ page }) => {
  const dialog = await openApp(page, { location: "denied" }); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await expect(dialog).toHaveAttribute("data-ready", "false");
  await expect(dialog.locator(".ar-callout")).toContainText("Location access was denied");
  await expect(page.getByRole("button", { name: "Retry location" })).toBeVisible();
  await page.getByRole("button", { name: "Choose a location" }).click();
  await page.getByRole("button", { name: "Sydney", exact: true }).click();
  await start(page); await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await expect(dialog).toHaveAttribute("data-ready", "true");
  await expect(dialog.locator(".ar-status")).toContainText("Sydney");
});

test("relative-only and invalid compass data never masquerade as north", async ({ page }) => {
  const dialog = await openApp(page); await start(page);
  await emit(page, { alpha: 90, beta: 120, gamma: 0, absolute: false, heading: 0, accuracy: -1 });
  await expect(dialog).toHaveAttribute("data-ready", "false");
  await expect(dialog.locator(".ar-callout")).toContainText("no reliable north reference");
  await expect(page.getByRole("button", { name: "Explore sky map instead" })).toBeVisible();
});

test("missing initial sensors produce a useful failure state", async ({ page }) => {
  await openApp(page); await start(page); await page.clock.runFor(8100);
  await expect(page.locator(".ar-callout")).toContainText("No motion data arrived");
});

test("suppresses labels on rejected video playback", async ({ page }) => {
  const dialog = await openApp(page, { playback: "denied" }); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await expect(dialog).toHaveAttribute("data-ready", "false");
  await expect(dialog.locator(".ar-callout")).toContainText("camera could not play");
});

test("pauses labels on camera mute and resumes without recalibration", async ({ page }) => {
  const dialog = await openApp(page, { muted: true }); await start(page);
  await emit(page, { alpha: 0, beta: 120, gamma: 0, absolute: true });
  await expect(dialog).toHaveAttribute("data-ready", "false");
  await mock(page, "unmuteCamera()"); await expect(dialog).toHaveAttribute("data-ready", "true");
  await mock(page, "muteCamera()"); await expect(dialog).toHaveAttribute("data-ready", "false");
  await mock(page, "unmuteCamera()"); await expect(dialog).toHaveAttribute("data-ready", "true");
});

for (const action of ["stop", "pagehide", "ended"] as const) test(`${action} releases camera tracks`, async ({ page }) => {
  await openApp(page); await start(page);
  if (action === "stop") await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  else if (action === "pagehide") await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  else await mock(page, "endCamera()");
  await expect(page.getByRole("button", { name: /^Start AR/ })).toBeVisible();
  expect(await mock(page, "trackStops")).toBe(1);
  if (action !== "ended") expect(await mock(page, "watchStops")).toBeGreaterThan(0);
});

test("a cancelled pending camera is stopped if it arrives late", async ({ page }) => {
  await openApp(page, { camera: "pending" }); await start(page);
  await page.getByRole("button", { name: "Cancel camera request" }).click();
  await mock(page, "resolveCamera()");
  await expect.poll(() => mock(page, "trackStops")).toBe(1);
  await expect(page.getByRole("button", { name: /^Start AR/ })).toBeVisible();
});
