import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-15T14:00:00Z");

type CameraMode = "success" | "denied" | "pending" | "front" | "unknown";
type PermissionMode = "none" | "granted" | "denied";

type ARMockOptions = {
  camera?: CameraMode;
  muted?: boolean;
  permission?: PermissionMode;
  playback?: "success" | "denied";
};

async function installARMock(
  page: Page,
  {
    camera = "success",
    muted = false,
    permission = "none",
    playback = "success",
  }: ARMockOptions = {},
) {
  await page.addInitScript(
    ({ cameraMode, initialMuted, permissionMode, playbackMode }) => {
      type MockState = {
        cameraRequests: number;
        cameraMuted: boolean;
        constraints: MediaStreamConstraints[];
        muteCamera: () => void;
        permissionCalls: Array<boolean | undefined>;
        screenAngle: number;
        trackStops: number;
        unmuteCamera: () => void;
        resolveCamera: () => void;
      };
      const testWindow = window as typeof window & { __arMock: MockState };
      const state: MockState = {
        cameraRequests: 0,
        cameraMuted: initialMuted,
        constraints: [],
        muteCamera: () => {},
        permissionCalls: [],
        screenAngle: 0,
        trackStops: 0,
        unmuteCamera: () => {},
        resolveCamera: () => {},
      };
      testWindow.__arMock = state;

      Object.defineProperty(window, "isSecureContext", {
        configurable: true,
        value: true,
      });

      const screenOrientation = new EventTarget();
      Object.defineProperty(screenOrientation, "angle", {
        configurable: true,
        get: () => state.screenAngle,
      });
      Object.defineProperty(screen, "orientation", {
        configurable: true,
        value: screenOrientation,
      });
      Object.defineProperty(window, "orientation", {
        configurable: true,
        get: () => state.screenAngle,
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
        readonly muted: boolean;
        getSettings: () => MediaTrackSettings;
        stop: () => void;
      };
      track.label = label;
      Object.defineProperty(track, "muted", {
        configurable: true,
        get: () => state.cameraMuted,
      });
      track.getSettings = () => ({
        width: 720,
        height: 1280,
        ...(facingMode ? { facingMode } : {}),
      });
      track.stop = () => {
        state.trackStops += 1;
      };
      state.muteCamera = () => {
        state.cameraMuted = true;
        track.dispatchEvent(new Event("mute"));
      };
      state.unmuteCamera = () => {
        state.cameraMuted = false;
        track.dispatchEvent(new Event("unmute"));
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
          if (playbackMode === "denied") {
            return Promise.reject(
              new DOMException("Playback blocked", "NotAllowedError"),
            );
          }
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
    {
      cameraMode: camera,
      initialMuted: muted,
      permissionMode: permission,
      playbackMode: playback,
    },
  );
}

async function openCameraAR(page: Page, options?: ARMockOptions) {
  await installARMock(page, options);
  await page.clock.install({ time: FIXED_NOW });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Camera AR" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little closer to the cosmos." }),
  ).toHaveCount(0);
  await expect(page.locator(".camera-launch")).toHaveCount(0);
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

  await expect(
    dialog.getByRole("button", { name: "Close camera AR" }),
  ).toHaveCount(0);

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
  await expect(
    dialog.getByRole("button", { name: "Close camera AR" }),
  ).toBeVisible();
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

test("taps a deterministically projected catalog star on the canvas and opens its information", async ({
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

  await dialog
    .getByRole("button", { name: "Calibrate camera alignment" })
    .click();
  await dialog.getByLabel("Faintest AR stars").fill("6");
  await dialog.getByRole("button", { name: "Close calibration" }).click();
  await dialog.getByRole("button", { name: "Search in camera AR" }).click();
  await dialog.getByLabel("Search AR objects").fill("HIP");
  const visibleStar = dialog
    .locator(".ar-results button")
    .filter({ hasText: "↑" })
    .first();
  await expect(visibleStar).toBeVisible();
  const starName = (await visibleStar.locator("span").first().innerText())
    .split("\n")[0]
    .trim();
  await visibleStar.click();
  await dialog.getByRole("button", { name: "Information ↗" }).click();

  const information = dialog.locator(".object-information");
  await expect(information.getByText("Catalog identifier")).toBeVisible();
  const directionText = await information
    .locator("dl div")
    .filter({ hasText: "Direction" })
    .locator("dd")
    .innerText();
  const altitudeText = await information
    .locator("dl div")
    .filter({ hasText: "Altitude" })
    .locator("dd")
    .innerText();
  const azimuth = Number.parseFloat(directionText.split("·").at(-1) ?? "");
  const altitude = Number.parseFloat(altitudeText);
  expect(Number.isFinite(azimuth)).toBe(true);
  expect(Number.isFinite(altitude)).toBe(true);

  await dialog.getByRole("button", { name: "Close AR information" }).click();
  await dialog.getByRole("button", { name: "Clear AR target" }).click();
  await emitOrientation(page, {
    alpha: (360 - azimuth) % 360,
    beta: 90 + altitude,
    gamma: 0,
    absolute: true,
  });
  await expect(dialog.locator(".ar-status span").first()).not.toHaveText(
    "Alignment needed",
  );

  const canvas = dialog.getByLabel(
    "Star and planet labels projected over the camera",
  );
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.tap({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 },
  });

  await expect(dialog.locator(".ar-sheet-title h2")).toHaveText(starName);
  await expect(dialog.locator(".object-information")).toContainText(/HIP \d+/);
});

test("keeps a physically equivalent landscape pose pointed north", async ({
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
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "N 0° · altitude 0°",
  );

  await page.evaluate(() => {
    const mock = (window as unknown as { __arMock: { screenAngle: number } })
      .__arMock;
    mock.screenAngle = 90;
    screen.orientation.dispatchEvent(new Event("change"));
  });
  await emitOrientation(page, {
    alpha: 90,
    beta: 0,
    gamma: -90,
    absolute: true,
  });
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    /^N (?:0|360)° · altitude 0°$/,
  );
});

test("suppresses pose labels when camera playback is rejected", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { playback: "denied" });
  await startCamera(dialog);
  await emitOrientation(page, {
    alpha: 0,
    beta: 90,
    gamma: 0,
    absolute: true,
  });

  await expect(dialog.getByRole("alert")).toContainText(
    "The camera could not play",
  );
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "Alignment needed",
  );
  await expect(dialog.locator(".ar-nearby")).toContainText(
    "Labels appear once the camera and alignment are ready.",
  );
});

test("starts paused when the browser initially mutes the camera track", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { muted: true });
  await startCamera(dialog);
  await emitOrientation(page, {
    alpha: 0,
    beta: 90,
    gamma: 0,
    absolute: true,
  });

  await expect(dialog.locator(".ar-header small")).toHaveText("CAMERA PAUSED");
  await expect(dialog.getByRole("status")).toContainText(
    "Camera paused by the browser",
  );
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "Alignment needed",
  );
  await expect(dialog.locator(".ar-nearby")).toContainText(
    "Labels appear once the camera and alignment are ready.",
  );
});

test("pauses labels on camera mute and resumes them on unmute", async ({
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
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "N 0° · altitude 0°",
  );

  await page.evaluate(() =>
    (
      window as unknown as { __arMock: { muteCamera: () => void } }
    ).__arMock.muteCamera(),
  );
  await expect(dialog.locator(".ar-header small")).toHaveText("CAMERA PAUSED");
  await expect(dialog.getByRole("status")).toContainText(
    "Camera paused by the browser",
  );
  await expect(dialog.locator(".ar-nearby")).toContainText(
    "Labels appear once the camera and alignment are ready.",
  );

  await page.evaluate(() =>
    (
      window as unknown as { __arMock: { unmuteCamera: () => void } }
    ).__arMock.unmuteCamera(),
  );
  await expect(dialog.locator(".ar-header small")).toHaveText("LIVE");
  await expect(dialog.locator(".ar-status span").first()).toHaveText(
    "N 0° · altitude 0°",
  );
  await expect(dialog.getByText("Camera paused by the browser")).toBeHidden();
  await expect(dialog.locator(".ar-nearby")).not.toContainText(
    "Labels appear once the camera and alignment are ready.",
  );
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

test("stops a late camera stream and restores setup when camera AR closes", async ({
  page,
}) => {
  const dialog = await openCameraAR(page, { camera: "pending" });
  await startCamera(dialog);
  await expect(
    dialog.getByRole("button", { name: "Cancel camera request" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close camera AR" }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Use this location & start camera",
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close camera AR" }),
  ).toHaveCount(0);

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
