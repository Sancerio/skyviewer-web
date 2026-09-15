import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-15T14:00:00Z");

async function openFixedSky(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_NOW });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little closer to the cosmos." }),
  ).toBeVisible();
}

async function openLocationDialog(page: Page) {
  await page.locator(".location-button").click();
  const dialog = page.getByRole("dialog", {
    name: "Where are you looking up?",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("searches for Sirius below the horizon and centers its details", async ({
  page,
}) => {
  await openFixedSky(page);

  await page.getByLabel("Search celestial objects").fill("Sirius");
  const result = page.locator(".object-row").filter({ hasText: "Sirius" });
  await expect(result).toContainText("Canis Major");
  await expect(result.locator(".below")).toBeVisible();
  await result.click();

  const details = page.locator(".selection-card");
  await expect(details.getByRole("heading", { name: "Sirius" })).toBeVisible();
  await expect(details).toContainText("Below the horizon");
  await expect(details.getByText("Magnitude", { exact: true })).toBeVisible();
  await expect(details.getByText("-1.4", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Sirius is below the horizon at this time and location.",
  );

  const altitude = Number.parseFloat(
    (
      await details
        .locator("dl div")
        .filter({ hasText: "Altitude" })
        .locator("dd")
        .innerText()
    ).replace("°", ""),
  );
  const azimuth = Number.parseFloat(
    (
      await details
        .locator("dl div")
        .filter({ hasText: "Azimuth" })
        .locator("dd")
        .innerText()
    ).replace("°", ""),
  );
  const compassDirection = (await details.locator("p").innerText())
    .split("·")[1]
    .trim();
  const centeredAltitude = Math.round(Math.max(-89, Math.min(89, altitude)));
  const centeredAzimuth = Math.round(azimuth);
  const heading = page.locator(".map-heading");
  await expect(heading).toContainText(
    `Looking ${compassDirection} ${centeredAzimuth}°`,
  );
  await expect(heading).toContainText(`Altitude ${centeredAltitude}°`);

  await page.locator("canvas").focus();
  await page.locator("canvas").press("ArrowLeft");
  await expect(heading).toContainText(`${Math.round((azimuth + 350) % 360)}°`);
  await details.getByRole("button", { name: "Center in sky" }).click();
  await expect(heading).toContainText(
    `Looking ${compassDirection} ${centeredAzimuth}°`,
  );
});

test("changes city and moves backward, forward, and back to Now in UTC", async ({
  page,
}) => {
  await openFixedSky(page);
  const dialog = await openLocationDialog(page);
  await dialog.getByRole("button", { name: "London", exact: true }).click();

  await expect(page.locator(".location-button")).toContainText("London");
  await expect(page.getByRole("status")).toHaveText(/Sky updated for London/);
  await expect(page.locator(".map-caption")).toContainText("London");

  const time = page.getByLabel("OBSERVING TIME · UTC");
  await expect(time).toHaveValue("2026-09-15T14:00");
  await time.fill("2026-09-16T03:30");
  await time.blur();
  await expect(time).toHaveValue("2026-09-16T03:30");
  await expect(page.locator(".map-badge")).toHaveText("TIME TRAVEL");

  await page.getByRole("button", { name: "One hour earlier" }).click();
  await expect(time).toHaveValue("2026-09-16T02:30");
  await expect(page.locator(".map-badge")).toHaveText("TIME TRAVEL");

  await page.getByRole("button", { name: "One hour later" }).click();
  await expect(time).toHaveValue("2026-09-16T03:30");
  await expect(page.locator(".map-badge")).toHaveText("TIME TRAVEL");

  await page.getByRole("button", { name: "Now", exact: true }).click();
  await expect(time).toHaveValue("2026-09-15T14:00");
  await expect(page.locator(".map-badge")).toHaveText("LIVE SKY");
});

test("toggles display layers and supports toolbar and keyboard view controls", async ({
  page,
}) => {
  await openFixedSky(page);

  const constellations = page.getByRole("button", { name: "Constellations" });
  const labels = page.getByRole("button", { name: "Labels" });
  const grid = page.getByRole("button", { name: "Grid" });
  const night = page.getByRole("button", { name: "Night mode" });
  await expect(constellations).toHaveAttribute("aria-pressed", "true");
  await expect(labels).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await expect(night).toHaveAttribute("aria-pressed", "false");

  await constellations.click();
  await labels.click();
  await grid.click();
  await night.click();
  await expect(constellations).toHaveAttribute("aria-pressed", "false");
  await expect(labels).toHaveAttribute("aria-pressed", "false");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(night).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app")).toHaveClass(/night-mode/);

  const fieldOfView = page.locator(".map-bottom");
  await expect(fieldOfView).toContainText("100° FIELD OF VIEW");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(fieldOfView).toContainText("90° FIELD OF VIEW");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(fieldOfView).toContainText("100° FIELD OF VIEW");

  const canvas = page.locator("canvas");
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await expect(page.locator(".map-heading")).toContainText("170°");
  await canvas.press("ArrowUp");
  await expect(page.locator(".map-heading")).toContainText("Altitude 48°");
  await canvas.press("+");
  await expect(fieldOfView).toContainText("90° FIELD OF VIEW");

  await page.getByRole("button", { name: "Reset sky view" }).click();
  await expect(page.locator(".map-heading")).toContainText("180°");
  await expect(page.locator(".map-heading")).toContainText("Altitude 38°");
  await expect(fieldOfView).toContainText("100° FIELD OF VIEW");
});

test("rejects invalid custom coordinates and applies valid coordinates", async ({
  page,
}) => {
  await openFixedSky(page);
  const dialog = await openLocationDialog(page);
  const form = dialog.locator("form");
  await form.evaluate((element) => element.setAttribute("novalidate", ""));
  await dialog.getByLabel("Latitude").fill("91");
  await dialog.getByLabel("Longitude").fill("181");
  await dialog.getByRole("button", { name: "Update sky" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter latitude from −90 to 90 and longitude from −180 to 180.",
  );

  await dialog.getByLabel("Latitude").fill("-33.9");
  await dialog.getByLabel("Longitude").fill("151.2");
  await dialog.getByRole("button", { name: "Update sky" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".location-button")).toContainText(
    "Custom location",
  );
  await expect(page.locator(".location-button")).toContainText("33.9° S");
  await expect(page.locator(".location-button")).toContainText("151.2° E");
  await expect(page.getByRole("status")).toContainText(
    "Sky updated for Custom location.",
  );
});

test("reports denied geolocation and keeps the location picker usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (reason: { code: number }) => void,
        ) => {
          error({ code: 1 });
        },
      },
    });
  });
  await openFixedSky(page);
  const dialog = await openLocationDialog(page);
  await dialog.getByRole("button", { name: "Use my location" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "Location could not be accessed.",
  );
  await dialog.getByRole("button", { name: "Tokyo", exact: true }).click();
  await expect(page.locator(".location-button")).toContainText("Tokyo");
});

test("applies mocked successful geolocation coordinates", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => {
          success({ coords: { latitude: 35.6895, longitude: 139.6917 } });
        },
      },
    });
  });
  await openFixedSky(page);
  const dialog = await openLocationDialog(page);
  await dialog.getByRole("button", { name: "Use my location" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator(".location-button")).toContainText("Your location");
  await expect(page.locator(".location-button")).toContainText("35.7° N");
  await expect(page.locator(".location-button")).toContainText("139.7° E");
  await expect(page.getByRole("status")).toContainText(
    "Sky updated for Your location.",
  );
});

test("falls back gracefully when compass APIs are unsupported", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
  });
  await openFixedSky(page);
  await page.getByRole("button", { name: "Follow phone compass" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Compass is unavailable here. Use the map controls, or open on a phone over HTTPS.",
  );
  await expect(
    page.getByRole("button", { name: "Follow phone compass" }),
  ).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has no horizontal overflow and keeps location and discovery flows usable", async ({
    page,
  }) => {
    await openFixedSky(page);
    const initialWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(initialWidths.document).toBeLessThanOrEqual(initialWidths.viewport);

    const dialog = await openLocationDialog(page);
    await dialog.getByRole("button", { name: "Sydney", exact: true }).click();
    await expect(page.locator(".location-button")).toContainText("Sydney");

    await page.getByLabel("Search celestial objects").fill("Jupiter");
    const result = page.locator(".object-row").filter({ hasText: "Jupiter" });
    await expect(result).toBeVisible();
    await result.click();
    await expect(
      page.locator(".selection-card").getByRole("heading", { name: "Jupiter" }),
    ).toBeVisible();

    const finalWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(finalWidths.document).toBeLessThanOrEqual(finalWidths.viewport);
  });
});
