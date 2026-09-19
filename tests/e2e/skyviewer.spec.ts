import { expect, test } from "@playwright/test";
import { mock, openApp } from "./mocks";
test("first visit explains access without requesting permissions on page load", async ({ page }, info) => {
  await openApp(page); await expect(page.getByRole("button", { name: "Start stargazing" })).toBeVisible();
  await expect(page.locator(".ar-location")).toContainText("Use your current location"); expect(await mock(page, "order")).toEqual([]);
  await info.attach("desktop-startup", { body: await page.screenshot(), contentType: "image/png" });
});
test("manual locations remain optional and never trigger camera requests", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click(); await page.getByRole("button", { name: "Sydney", exact: true }).click();
  await expect(page.locator(".ar-location")).toContainText("Sydney"); expect(await mock(page, "order")).toEqual([]);
});
test("validates manual coordinates before applying them", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.locator("form").evaluate(el => el.setAttribute("novalidate", "")); await page.getByLabel("Latitude").fill("91"); await page.getByLabel("Longitude").fill("181");
  await page.getByRole("button", { name: "Update sky" }).click(); await expect(page.getByRole("alert")).toContainText("Enter latitude from −90 to 90");
  await page.getByLabel("Latitude").fill("-33.9"); await page.getByLabel("Longitude").fill("151.2"); await page.getByRole("button", { name: "Update sky" }).click();
  await expect(page.locator(".ar-location")).toContainText("-33.900°, 151.200°");
});
test("picker requests one location acquisition and returns its result", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click(); await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.locator(".ar-location")).toContainText("Your location"); expect(await mock(page, "locationRequests")).toBe(1); expect(await mock(page, "watchRequests")).toBe(0);
});
for (const selection of ["close", "London"]) test(`late GPS cannot overwrite ${selection}`, async ({ page }) => {
  await openApp(page, { location: "pending" }); await page.getByRole("button", { name: "Change", exact: true }).click(); await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await page.getByRole("button", { name: selection === "close" ? "Close dialog" : selection, exact: true }).click(); await mock(page, "deliverLocation(0,0)");
  await expect(page.locator(".ar-location")).toContainText(selection === "close" ? "Use your current location" : "London");
});
test("denied location in picker leaves city choices usable", async ({ page }) => {
  await openApp(page, { location: "denied" }); await page.getByRole("button", { name: "Change", exact: true }).click(); await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Location access is off"); await page.getByRole("button", { name: "Tokyo", exact: true }).click(); await expect(page.locator(".ar-location")).toContainText("Tokyo");
});
test("Help handles unsupported permission queries without triggering hardware", async ({ page }, info) => {
  await openApp(page); await page.getByRole("button", { name: "Help with access", exact: true }).click();
  await expect(page.locator(".permission-hints")).toContainText("Cannot check in advance"); expect(await mock(page, "order")).toEqual([]);
  await expect(page.getByRole("region", { name: "Access help" })).toContainText("cannot save or grant system permissions");
  await info.attach("desktop-access-help", { body: await page.screenshot(), contentType: "image/png" }); await page.getByRole("button", { name: "Close help" }).click();
  await expect(page.getByRole("button", { name: "Start stargazing" })).toBeVisible();
});
test("home-screen manifest has a stable in-scope identity", async ({ page, request }) => {
  await openApp(page); const href = await page.locator('link[rel="manifest"]').getAttribute("href"); expect(href).toBeTruthy();
  const response = await request.get(new URL(href!, page.url()).href); expect(response.ok()).toBe(true);
  const manifest = await response.json(); expect(manifest.id).toBe("./"); expect(manifest.scope).toBe("./"); expect(manifest.start_url).toBe("./"); expect(manifest.display).toBe("standalone");
});
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) test(`setup and picker fit ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
  await page.setViewportSize(viewport); await openApp(page); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Change", exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach(`picker-${viewport.width}`, { body: await page.screenshot(), contentType: "image/png" });
});
