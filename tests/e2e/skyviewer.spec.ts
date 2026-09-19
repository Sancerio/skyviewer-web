import { expect, test } from "@playwright/test";
import { mock, openApp } from "./mocks";

test("opens with automatic location as the default and does not request sensors prematurely", async ({ page }) => {
  const dialog = await openApp(page);
  await expect(page.getByRole("button", { name: "Start AR · use my location" })).toBeVisible();
  await expect(dialog.locator(".ar-location")).toContainText("Use your current location");
  expect(await mock(page, "cameraRequests")).toBe(0); expect(await mock(page, "locationRequests")).toBe(0);
});

test("manual locations remain an optional fallback", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("button", { name: "Sydney", exact: true }).click();
  await expect(page.locator(".ar-location")).toContainText("Sydney");
  await expect(page.getByRole("button", { name: "Start AR at this location" })).toBeVisible();
});

test("validates custom coordinates", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.locator("form").evaluate(el => el.setAttribute("novalidate", ""));
  await page.getByLabel("Latitude").fill("91"); await page.getByLabel("Longitude").fill("181");
  await page.getByRole("button", { name: "Update sky" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter latitude from −90 to 90");
  await page.getByLabel("Latitude").fill("-33.9"); await page.getByLabel("Longitude").fill("151.2");
  await page.getByRole("button", { name: "Update sky" }).click();
  await expect(page.locator(".ar-location")).toContainText("-33.900°, 151.200°");
});

test("the picker can request GPS directly and returns with the actual fix", async ({ page }) => {
  await openApp(page); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.locator(".ar-location")).toContainText("Your location");
  await expect(page.locator(".ar-location")).toContainText("1.352°, 103.820°");
});

for (const selection of ["close", "London"]) test(`late GPS does not overwrite ${selection === "close" ? "a cancelled picker" : "a chosen city"}`, async ({ page }) => {
  await openApp(page, { location: "pending" }); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await page.getByRole("button", { name: selection === "close" ? "Close dialog" : selection, exact: true }).click();
  await mock(page, "deliverLocation(0, 0)");
  await expect(page.locator(".ar-location")).toContainText(selection === "close" ? "Use your current location" : "London");
  await expect(page.locator(".ar-location")).not.toContainText("Your location");
});

test("reports denied GPS in the picker with a usable manual fallback", async ({ page }) => {
  await openApp(page, { location: "denied" }); await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Location access was denied");
  await page.getByRole("button", { name: "Tokyo", exact: true }).click();
  await expect(page.locator(".ar-location")).toContainText("Tokyo");
});

test("small-screen setup and picker have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await openApp(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Change", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
