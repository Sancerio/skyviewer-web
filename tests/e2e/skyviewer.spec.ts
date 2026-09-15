import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-15T14:00:00Z");

async function installCameraRequestCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { cameraRequests: 0 };
    (
      window as typeof window & {
        __shellMock: { cameraRequests: number };
      }
    ).__shellMock = state;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve([]),
        getUserMedia: () => {
          state.cameraRequests += 1;
          return Promise.reject(
            new DOMException("Unexpected camera request", "NotAllowedError"),
          );
        },
      },
    });
  });
}

async function openCameraSetup(page: Page): Promise<Locator> {
  await installCameraRequestCounter(page);
  await page.clock.install({ time: FIXED_NOW });
  await page.goto("/");

  const camera = page.getByRole("dialog", { name: "Camera AR" });
  await expect(camera).toBeVisible();
  await expect(
    camera.getByRole("button", {
      name: "Use this location & start camera",
    }),
  ).toBeVisible();
  await expect(
    camera.getByRole("button", { name: "Close camera AR" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __shellMock: { cameraRequests: number };
            }
          ).__shellMock.cameraRequests,
      ),
    )
    .toBe(0);

  return camera;
}

async function openLocationPicker(camera: Locator): Promise<Locator> {
  await camera.getByRole("button", { name: "Change", exact: true }).click();
  const picker = camera.page().getByRole("dialog", {
    name: "Where are you looking up?",
  });
  await expect(picker).toBeVisible();
  await expect(camera).toHaveCount(0);
  return picker;
}

async function expectCameraLocation(
  page: Page,
  name: string,
  coordinates: string,
): Promise<Locator> {
  const camera = page.getByRole("dialog", { name: "Camera AR" });
  await expect(camera).toBeVisible();
  await expect(camera.locator(".ar-location")).toContainText(name);
  await expect(camera.locator(".ar-location")).toContainText(coordinates);
  return camera;
}

test("opens directly in camera setup without starting camera or rendering map UI", async ({
  page,
}) => {
  const camera = await openCameraSetup(page);

  await expect(camera.locator(".ar-location")).toContainText("Singapore");
  await expect(camera.locator(".ar-location")).toContainText(
    "1.352°, 103.820°",
  );
  await expect(
    page.getByRole("heading", { name: "A little closer to the cosmos." }),
  ).toHaveCount(0);
  await expect(page.locator(".camera-launch")).toHaveCount(0);
  await expect(page.locator(".sky-panel")).toHaveCount(0);
  await expect(page.getByLabel("Search celestial objects")).toHaveCount(0);
  await expect(page.getByLabel("OBSERVING TIME · UTC")).toHaveCount(0);
});

test("changes to a preset location and returns to camera setup", async ({
  page,
}) => {
  const camera = await openCameraSetup(page);
  const picker = await openLocationPicker(camera);

  await picker.getByRole("button", { name: "Sydney", exact: true }).click();
  await expectCameraLocation(page, "Sydney", "-33.869°, 151.209°");
});

test("validates and applies custom coordinates to camera setup", async ({
  page,
}) => {
  const picker = await openLocationPicker(await openCameraSetup(page));
  const form = picker.locator("form");
  await form.evaluate((element) => element.setAttribute("novalidate", ""));
  await picker.getByLabel("Latitude").fill("91");
  await picker.getByLabel("Longitude").fill("181");
  await picker.getByRole("button", { name: "Update sky" }).click();
  await expect(picker.getByRole("alert")).toHaveText(
    "Enter latitude from −90 to 90 and longitude from −180 to 180.",
  );

  await picker.getByLabel("Latitude").fill("-33.9");
  await picker.getByLabel("Longitude").fill("151.2");
  await picker.getByRole("button", { name: "Update sky" }).click();
  await expectCameraLocation(page, "Custom location", "-33.900°, 151.200°");
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
        ) => error({ code: 1 }),
      },
    });
  });
  const picker = await openLocationPicker(await openCameraSetup(page));

  await picker.getByRole("button", { name: "Use my location" }).click();
  await expect(picker.getByRole("alert")).toContainText(
    "Location could not be accessed.",
  );
  await picker.getByRole("button", { name: "Tokyo", exact: true }).click();
  await expectCameraLocation(page, "Tokyo", "35.676°, 139.650°");
});

test("closing the location picker cancels delayed GPS and restores camera setup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => {
          (
            window as typeof window & { deliverLocation: () => void }
          ).deliverLocation = () =>
            success({ coords: { latitude: 0, longitude: 0 } });
        },
      },
    });
  });
  const picker = await openLocationPicker(await openCameraSetup(page));
  await picker.getByRole("button", { name: "Use my location" }).click();
  await picker.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(() =>
    (
      window as typeof window & { deliverLocation: () => void }
    ).deliverLocation(),
  );

  await expectCameraLocation(page, "Singapore", "1.352°, 103.820°");
});

test("a delayed GPS result does not overwrite a chosen city", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => {
          (
            window as typeof window & { deliverLocation: () => void }
          ).deliverLocation = () =>
            success({ coords: { latitude: 0, longitude: 0 } });
        },
      },
    });
  });
  const picker = await openLocationPicker(await openCameraSetup(page));
  await picker.getByRole("button", { name: "Use my location" }).click();
  await picker.getByRole("button", { name: "London", exact: true }).click();
  await page.evaluate(() =>
    (
      window as typeof window & { deliverLocation: () => void }
    ).deliverLocation(),
  );

  await expectCameraLocation(page, "London", "51.507°, -0.128°");
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has no horizontal overflow in camera setup or the location picker", async ({
    page,
  }) => {
    const camera = await openCameraSetup(page);
    const setupWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(setupWidths.document).toBeLessThanOrEqual(setupWidths.viewport);

    const picker = await openLocationPicker(camera);
    const pickerWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(pickerWidths.document).toBeLessThanOrEqual(pickerWidths.viewport);

    await picker.getByRole("button", { name: "Close dialog" }).click();
    await expectCameraLocation(page, "Singapore", "1.352°, 103.820°");
  });
});
