import { expect, test } from "@playwright/test";
import { emit, mock, openApp, ready, start } from "./mocks";

test("a pose received during motion retry is not timed out afterwards", async ({ page }) => {
  await openApp(page, { permission: "granted" });
  await start(page);
  await expect(page.locator(".ar-header small")).toHaveText("LIVE");
  await page.clock.runFor(8100);
  await mock(page, "permissionMode = 'pending'");
  await page.getByRole("button", { name: "Retry motion", exact: true }).click();
  await emit(page, { alpha: 90, beta: 120, gamma: 0, absolute: true });
  await mock(page, "resolveMotion('granted')");
  await page.clock.runFor(8100);
  await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
  expect(await mock(page, "cameraRequests")).toBe(1);
  expect(await mock(page, "locationRequests")).toBe(1);
  expect(await mock(page, "permissionCalls")).toEqual([true, true]);
});

test("location failure during live viewing retries location only", async ({ page }, info) => {
  await openApp(page, { permission: "granted" }); await ready(page);
  await page.getByRole("button", { name: "Sky display settings" }).click();
  await mock(page, "locationMode = 'denied'");
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(page.getByRole("alert")).toContainText("Location access is off");
  await page.getByRole("button", { name: "Close display settings" }).click();
  await expect(page.locator(".ar-callout")).toContainText("Location access is off");
  await info.attach("synthetic-location-recovery", { body: await page.screenshot(), contentType: "image/png" });
  await mock(page, "locationMode = 'success'");
  await page.getByRole("button", { name: "Try location again", exact: true }).click();
  await expect(page.locator(".ar-view")).toHaveAttribute("data-ready", "true");
  expect(await mock(page, "cameraRequests")).toBe(1);
  expect(await mock(page, "permissionCalls")).toEqual([true]);
});

test("mobile access help and picker are visible and usable", async ({ page }, info) => {
  await openApp(page, { standalone: true });
  await page.getByRole("button", { name: "Help with access", exact: true }).click();
  await expect(page.getByRole("region", { name: "Access help" })).toBeVisible();
  await expect(page.locator(".permission-hints")).toContainText("Cannot check in advance");
  await info.attach("mobile-access-help", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Close help" }).click();
  await expect(page.getByRole("button", { name: "Start stargazing" })).toBeFocused();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Where are you looking up?" });
  await expect(picker).toBeVisible();
  // toBeVisible alone does not detect occlusion: the inert camera can still
  // paint above a clickable modal. Verify the actual stacking contract too.
  const layers = await page.evaluate(() => ({
    picker: Number(getComputedStyle(document.querySelector(".location-picker")!).zIndex),
    camera: Number(getComputedStyle(document.querySelector(".ar-view")!).zIndex),
  }));
  expect(layers.picker).toBeGreaterThan(layers.camera);
  await info.attach("mobile-location-picker", { body: await page.screenshot(), contentType: "image/png" });
  expect(await mock(page, "order")).toEqual([]);
  await picker.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Start stargazing" })).toBeVisible();
});

test("pending setup clearly shows the current stage", async ({ page }, info) => {
  await openApp(page, { permission: "pending" }); await start(page);
  await expect(page.locator(".startup-progress strong")).toHaveText("Enabling motion…");
  await expect(page.locator('[aria-current="step"]')).toHaveText("Motion");
  await info.attach("mobile-motion-progress", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Cancel setup" }).click();
  expect(await mock(page, "cameraRequests")).toBe(0);
});

test("installed-app icon is a decodable bundled PNG", async ({ page }) => {
  await openApp(page);
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(href).toBeTruthy();
  const dimensions = await page.evaluate(async path => {
    const image = new Image(); image.src = path!; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, href);
  expect(dimensions).toEqual({ width: 512, height: 512 });
});
