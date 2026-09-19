# SkyViewer Web

A free, open-source sky viewer for your phone browser.

[Open SkyViewer](https://sancerio.github.io/skyviewer-web/)

## Point and explore

Tap **Start stargazing**, allow the requested access, and point your phone at the
sky. Location and compass alignment are automatic; choosing a city or manually
setting north is not required. The camera overlay includes 5,044 catalog stars,
the Sun, the Moon and seven planets, with search, object details and guidance.
A clearly labelled sky map works without camera or motion access.

Returning visitors see **Open camera**, rather than the full introduction.
Backgrounding or locking the phone turns capture off; returning to the same
session offers **Resume stargazing**. The app never opens hardware on page load
or automatically when it becomes visible again.

## iPhone Home Screen and permissions

The Home Screen version is still a web app. iOS/browser policy decides how long
camera, motion and location permissions last. A cold launch can require consent
again; neither a manifest nor a saved app setting grants system access.

SkyViewer reduces avoidable requests: motion grants are reused only in the live
document, recent location fixes are reused briefly on restart, location edits do
not remount the camera, and retries target only the failing feature. Startup
progress distinguishes motion, location and camera. **Help with access** explains
permission recovery and the Home Screen limitation without promising permanent
permission. See [permissions and returning-user flow](docs/PERMISSIONS.md).

## Saved preferences and observing places

Successful onboarding and star-density choices are remembered on this device.
By default GPS coordinates are **not** saved across launches. **Sky display →
Save observing place** is an explicit opt-in to store rounded coordinates for a
fixed observing place. Future visits can use it without requesting GPS. It is
labelled **Saved place, not live GPS**; use **Use current location** when travelling
or **Forget saved place** to remove it.

The app uses a one-shot location fix rather than continuous background tracking.
It shows the age of the fix; use current location again after moving. A GPS fix
older than five minutes is refreshed when restarting camera view. No assumed
Singapore location is used. A denied request never becomes a made-up location.

Preferences are best-effort: browser storage can be blocked or cleared. The app
still works for the current visit and reports failed explicit saves.

## Privacy

No account, backend, API key, analytics, microphone, recording or camera uploads.
Astronomy and magnetic-north correction are calculated on the device. Camera
tracks stop on background, stop, close and unmount. Pending results after
cancellation are ignored; late camera streams are stopped. OS/browser location
services and static hosting have their own privacy policies and access logs.

## Run and verify

Node.js 22.12+ or 24 LTS:

```sh
npm ci
npm run dev
npm test
npm run build
# Linux: Chromium and WebKit with desktop/mobile viewport projects
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

GitHub Actions runs tests before Pages deployment. Browser tests simulate camera,
location and motion; they do not prove real iOS prompt persistence or optical
alignment. [Camera AR](docs/CAMERA_AR.md) and [permissions](docs/PERMISSIONS.md)
include the remaining physical-device checks. Older scope and verification
documents are historical and do not override these current contracts.

## Architecture and limits

React + TypeScript + Vite, Canvas 2D, Astronomy Engine 2.1.19, and offline WMM2025.
No new runtime dependency or remote service is needed. Catalog and fonts are
bundled. A relative manifest identity/scope/start URL and bundled icon support
Home Screen launches; there is no offline service worker.

This is a computed, sensor-based overlay, not camera recognition or native
visual-inertial AR. Markers are enlarged for readability; Moon illumination is
illustrated. Camera field of view uses a crop-aware 65-degree long-edge estimate.
Sensor bias, local magnetic interference, lens distortion and camera/IMU offsets
can still cause alignment error. Outdoor iPhone/Android testing is required before
claiming a measured angular accuracy.

Geometric positions omit refraction, terrain, extinction and light pollution;
star positions omit proper motion. WMM2025 covers 2025–2029; an expired or
unavailable correction is labelled. Relative-only sensors do not establish north.
No satellites, deep-sky images or telescope control. Never aim optics at the Sun.

## Data and license

Application code: [MIT](LICENSE). Catalog: D3 Celestial BSD-3-Clause with credits
in [DATA.md](docs/DATA.md). NOAA NCEI/BGS WMM2025 coefficient attribution is in
`src/declination.ts` and [Camera AR](docs/CAMERA_AR.md). Dependency and font notices
ship in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). The Home Screen
icon is a raster version of the existing project favicon.
This independent project is not affiliated with similarly named commercial apps.
