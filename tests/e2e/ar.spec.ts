import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-15T14:00:00Z");

type CameraMode = "success" | "denied" | "pending" | "front" | "unknown";
type PermissionMode = "none" | "granted" | "denied";

type ARMockOptions = {
  camera?: CameraMode;
  permission?: PermissionMode;
};

async function installARMock(
  page: Page,
  { camera = "success", permission = "none" }: ARMockOptions = {},
) {
  await page.addInitScript(
    ({ cameraMode, permissionMode }) => {
      type MockState = {
        cameraRequests: number;
        constraints: MediaStreamConstraints[];
        permissionCalls: Array<boolean | undefined>;
        trackStops: number;
        resolveCamera: () => void;
      };
      const testWindow = window as typeof window & { __arMock: MockState };
      const state: MockState = {
        cameraRequests: 0,
        constraints: [],
        permissionCalls: [],
        trackStops: 0,
        resolveCamera: () => {},
      };
      testWindow.__arMock = state;

      Object.defineProperty(window, "isSecureContext", {
        configurable: true,
        value: true,
      });

      const facingMode =
        cameraMode === "front"
          ? "user"
          : cameraMode === "unknown"
            ? undefined
            : "environment";
      const label =
        cameraMode === "front"
          ? "Front Camera"
          : cameraMode === "unknown"
            ? "Integrated Camera"
            : "Back Camera";
      const track = new EventTarget() as EventTarget & {
        label: string;
        getSettings: () => MediaTrackSettings;
        stop: () => void;
      };
      track.label = label;
      track.getSettings = () => ({
        width: 720,
        height: 1280,
        ...(facingMode ? { facingMode } : {}),
      });
      track.stop = () => {
        state.trackStops += 1;
      };

      const stream = new MediaStream();
      Object.defineProperties(stream, {
        getTracks: {
          configurable: true,
          value: () => [track],
        },
        getVideoTracks: {
          configurable: true,
          value: () => [track],
        },
      });

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          enumerateDevices: () => Promise.resolve([]),
          getUserMedia: (constraints: MediaStreamConstraints) => {
            state.cameraRequests += 1;
            state.constraints.push(constraints);
            if (cameraMode === "denied") {
              return Promise.reject(
                new DOMException("Camera permission denied", "NotAllowedError"),
              );
            }
            if (cameraMode === "pending") {
              return new Promise<MediaStream>((resolve) => {
                state.resolveCamera = () => resolve(stream);
              });
            }
            return Promise.resolve(stream);
          },
        },
      });

      class MockDeviceOrientationEvent extends Event {}
      if (permissionMode !== "none") {
        Object.defineProperty(MockDeviceOrientationEvent, "requestPermission", {
          configurable: true,
          value: (absolute?: boolean) => {
            state.permissionCalls.push(absolute);
            return Promise.resolve(permissionMode);
          },
        });
      }
      Object.defineProperty(window, "DeviceOrientationEvent", {
        configurable: true,
        value: MockDeviceOrientationEvent,
      });

      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: function () {
          Object.defineProperties(this, {
            videoWidth: { configurable: true, value: 720 },
            videoHeight: { configurable: true, value: 1280 },
          });
          queueMicrotask(() => {
            this.dispatchEvent(new Event("loadedmetadata"));
            this.dispatchEvent(new Event("playing"));
          });
          return Promise.resolve();
        },
      });
    },
    { cameraMode: camera, permissionMode: permission },
  );
}

async function openCameraAR(page: Page, options?: ARMockOptions) {
  await installARMock(page, options);
  await page.clock.install({ time: FIXED_NOW });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little closer to the cosmos." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Camera AR/ }).click();
  const dialog = page.getByRole("dialog", { name: "Camera AR" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function startCamera(dialog: ReturnType<Page["getByRole"]>) {
  await dialog
    .getByRole("button", { name: "Use this location & start camera" })
    .click();
}

async function emitOrientation(
  page: Page,
  values: {
    alpha: number;
    beta: number;
    gamma: number;
    absolute: boolean;
    heading?: number;
    accuracy?: number;
  },
) {
  await page.evaluate((reading) => {
    const event = new Event(
      reading.absolute ? "deviceorientationabsolute" : "deviceorientation",
    );
    Object.defineProperties(event, {
      alpha: { value: reading.alpha },
      beta: { value: reading.beta },
      gamma: { value: reading.gamma },
      absolute: { value: reading.absolute },
      ...(reading.heading === undefined
        ? {}
        : { webkitCompassHeading: { value: reading.heading } }),
      ...(reading.accuracy === undefined
        ? {}
        : { webkitCompassAccuracy: { value: reading.accuracy } }),
    });
    window.dispatchEvent(event);
  }, values);
}

test("does not request a camera until the explicit AR start gesture", async ({
  page,
}) => {
  const dialog = await openCameraAR(page);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __arMock: { cameraRequests: number } })
            .__arMock.cameraRequests,
      ),
    )
    .toBe(0);

  await startCamera(dialog);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");
  const mock = await page.evaluate(
    () =>
      (
        window as unknown as {
          __arMock: {
            cameraRequests: number;
            constraints: MediaStreamConstraints[];
          };
        }
      ).__arMock,
  );
  expect(mock.cameraRequests).toBe(1);
  expect(mock.constraints[0]).toEqual({
    audio: false,
    video: { facingMode: { exact: "environment" } },
  });
});

test("requests iOS absolute orientation synchronously and leaves no camera on denial", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { permission: "denied" });
  await startCamera(dialog);

  await expect(dialog.getByRole("alert")).toContainText(
    "Motion and orientation access was denied",
  );
  const mock = await page.evaluate(
    () =>
      (
        window as unknown as {
          __arMock: {
            permissionCalls: Array<boolean | undefined>;
            cameraRequests: number;
            trackStops: number;
          };
        }
      ).__arMock,
  );
  expect(mock.permissionCalls).toEqual([true]);
  expect(mock.cameraRequests).toBe(0);
  expect(mock.trackStops).toBe(0);
});

test("reports an Android camera denial and keeps the AR setup retryable", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { camera: "denied" });
  await startCamera(dialog);

  await expect(dialog.getByRole("alert")).toContainText(
    "Rear-camera access was denied",
  );
  await expect(
    dialog.getByRole("button", {
      name: "Use this location & start camera",
    }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __arMock: { cameraRequests: number } })
            .__arMock.cameraRequests,
      ),
    )
    .toBe(1);
});

test("follows an absolute heading and tilt, then opens searchable object information", async ({
  page,
}, testInfo) => {
  const dialog = await openCameraAR(page);
  await startCamera(dialog);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");

  await emitOrientation(page, {
    alpha: 90,
    beta: 90,
    gamma: 0,
    absolute: true,
  });
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "W 270° · altitude 0°",
  );
  await expect(dialog.locator(".ar-accuracy")).toContainText(
    "Approximate alignment · device north",
  );

  await emitOrientation(page, {
    alpha: 90,
    beta: 120,
    gamma: 0,
    absolute: true,
  });
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "W 270° · altitude 30°",
  );
  await expect(dialog.locator(".ar-nearby")).not.toContainText(
    "Labels appear once the camera and alignment are ready.",
  );

  await dialog.getByRole("button", { name: "Search in camera AR" }).click();
  await dialog.getByLabel("Search AR objects").fill("Jupiter");
  await dialog
    .locator(".ar-results button")
    .filter({ hasText: "Jupiter" })
    .click();
  await dialog.getByRole("button", { name: "Information ↗" }).click();
  const information = dialog.locator(".object-information");
  await expect(information).toContainText(
    "The largest planet in our solar system",
  );
  await expect(information.getByText("Visual magnitude")).toBeVisible();
  await expect(information.getByText("Right ascension")).toBeVisible();

  await testInfo.attach("mocked-ar-pose-and-object-information", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("keeps relative iOS labels hidden until north calibration and applies the correction sign", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { permission: "granted" });
  await startCamera(dialog);
  await emitOrientation(page, {
    alpha: 90,
    beta: 90,
    gamma: 0,
    absolute: false,
  });

  await expect(dialog.locator(".ar-nearby")).toContainText(
    "Labels appear once the camera and alignment are ready.",
  );
  await dialog.getByRole("button", { name: "Calibrate alignment" }).click();
  await dialog
    .getByRole("button", { name: "Set camera direction to north" })
    .click();
  await expect(dialog.getByRole("status")).toContainText("North reference set");
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    /^N (?:0|360)° · altitude 0°$/,
  );
});

test("uses an iOS flat-phone compass reference for the same upright alpha", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { permission: "granted" });
  await startCamera(dialog);
  await emitOrientation(page, {
    alpha: 40,
    beta: 0,
    gamma: 0,
    absolute: false,
    heading: 80,
    accuracy: 8,
  });

  await dialog.getByRole("button", { name: "Calibrate alignment" }).click();
  await dialog.getByRole("button", { name: "Use flat-phone compass" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Compass reference set",
  );

  await emitOrientation(page, {
    alpha: 40,
    beta: 90,
    gamma: 0,
    absolute: false,
    heading: 80,
    accuracy: 8,
  });
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "E 80° · altitude 0°",
  );
  await expect(dialog.locator(".ar-accuracy")).toContainText("compass ±8°");
});

test("stopping AR releases the camera track and returns to setup", async ({
  page,
}) => {
  const dialog = await openCameraAR(page);
  await startCamera(dialog);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");

  await dialog.getByRole("button", { name: "Stop camera" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Use this location & start camera",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __arMock: { trackStops: number } }).__arMock
            .trackStops,
      ),
    )
    .toBe(1);
});

test("stops a late camera stream resolved after the AR dialog closes", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { camera: "pending" });
  await startCamera(dialog);
  await expect(
    dialog.getByRole("button", { name: "Cancel camera request" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close camera AR" }).click();
  await expect(dialog).toBeHidden();

  await page.evaluate(() =>
    (
      window as unknown as { __arMock: { resolveCamera: () => void } }
    ).__arMock.resolveCamera(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __arMock: { trackStops: number } }).__arMock
            .trackStops,
      ),
    )
    .toBe(1);
});

test("pagehide releases the active camera", async ({ page }) => {
  const dialog = await openCameraAR(page);
  await startCamera(dialog);
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(
    dialog.getByRole("button", {
      name: "Use this location & start camera",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __arMock: { trackStops: number } }).__arMock
            .trackStops,
      ),
    )
    .toBe(1);
});

test("hides projected labels after orientation data becomes stale", async ({
  page,
}) => {
  const dialog = await openCameraAR(page);
  await startCamera(dialog);
  await emitOrientation(page, {
    alpha: 0,
    beta: 90,
    gamma: 0,
    absolute: true,
  });
  await expect(dialog.locator(".ar-accuracy")).toBeVisible();

  await page.clock.runFor(3_100);
  await expect(dialog.getByRole("status")).toContainText(
    "Waiting for motion data",
  );
  await expect(dialog.locator(".ar-accuracy")).toBeHidden();
  await expect(dialog.locator(".ar-nearby")).toContainText(
    "Labels appear once the camera and alignment are ready.",
  );
});

for (const { camera, description } of [
  { camera: "front", description: "a front" },
  { camera: "unknown", description: "an unknown" },
] as const) {
  test(`rejects ${description} camera instead of presenting it as rear-camera AR`, async ({
    page,
  }) => {
    const dialog = await openCameraAR(page, { camera });
    await startCamera(dialog);

    await expect(dialog.getByRole("alert")).toContainText(
      "A rear camera could not be found",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __arMock: { trackStops: number } }).__arMock
              .trackStops,
        ),
      )
      .toBe(1);
  });
}
