# SkyViewer Web

A free, open-source camera AR sky viewer for your phone browser.

[Open the app](https://sancerio.github.io/skyviewer-web/)

## Point and explore

Tap **Start AR · use my location**, allow location, motion and camera access, then
point your phone at the sky. GPS and compass alignment are automatic. There is
no required city picker, flat-phone step, north calibration or heading slider.
Permissions are requested only after your gesture, never on page load.

- 5,044 magnitude-6 catalog stars, plus calculated Sun, Moon and seven planets.
- Filled, high-contrast star and planet markers; Moon phase with its bright limb
  oriented toward the Sun; collision-managed labels, search and object details.
- Rear-camera perspective projection with heading, tilt, roll, screen rotation
  and video-cover cropping. Magnetic north is corrected locally with WMM2025.
- Stars remain visible when the phone is stationary. Camera pause and permission
  failures have explicit recovery states rather than an unexplained empty view.
- Optional sky-map fallback supports dragging and arrow keys, clearly labelled
  as not camera-aligned. Manual location is only a fallback or exploration option.
- No account, API key, analytics, recording, microphone capture or backend.

There is no assumed Singapore location. Until a real GPS fix or an explicit
manual location is available, the app does not pretend to know the local sky.
Coordinates and settings stay in page memory and reset on reload. Browser/OS
location services have their own policies; the application does not upload your
location or camera frames. GitHub Pages may keep normal hosting access logs.

## Run and verify

Node.js 22.12+ or 24 LTS:

```sh
npm ci
npm run dev
npm test
npm run build
# Linux browser suite: desktop Chromium, Android-like Chromium, iPhone-like WebKit
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

The same build and tests run in GitHub Actions before Pages deployment. Browser
tests use synthetic camera, location and motion data: they are not a substitute
for physical-phone testing. See [Camera AR](docs/CAMERA_AR.md) for the current
architecture and outdoor verification checklist. Earlier verification documents
record historical versions, not evidence for this implementation.

## Architecture and data

React + TypeScript + Vite, Canvas 2D, Astronomy Engine 2.1.19, and an offline
WMM2025 declination evaluator. No new runtime dependency or external API is required.
Original pinned catalog files remain in `src/data`; `npm run catalog` regenerates
the browser subset.

- [Current camera AR operation and verification](docs/CAMERA_AR.md)
- [Catalog provenance and attribution](docs/DATA.md)
- [Competitive research](docs/COMPETITIVE_RESEARCH.md)
- [Historical scope](docs/SCOPE.md)
- [Historical verification](docs/VERIFICATION.md)
- [Contributing](CONTRIBUTING.md)

## Limits

This is a calculated, sensor-based sky overlay, not image recognition or native
visual-inertial AR. Geometric astronomical positions omit atmospheric refraction,
terrain, extinction and light pollution; stars omit proper motion. Markers are
enlarged for readability. The Moon phase is illustrated, not a surface photograph.

Camera field of view is estimated (65-degree long edge, automatically cropped).
Browser APIs do not provide a universally calibrated lens/IMU model. Magnetometer
interference, sensor conventions and lens distortion can still cause visible
alignment error. Physical Safari/Android sky alignment must be checked before
claiming precision. WMM2025 expires at 2030; outside its validity or near weak
polar fields, the UI explicitly reports magnetic rather than corrected true north.
Devices without a usable absolute compass get a sky map, not invented AR bearings.

No satellites, deep-sky images, offline service worker or telescope control.
Never point binoculars or a telescope at the Sun using this app.

## License

Application code: [MIT](LICENSE). Catalog: D3 Celestial BSD-3-Clause with credits
in [DATA.md](docs/DATA.md). NOAA NCEI/BGS WMM2025 coefficients and reference values
are public-domain government material, not covered by the application's copyright;
see https://doi.org/10.25921/aqfd-sd83 and `src/declination.ts` for attribution.
Dependency and font notices are distributed in
[public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt).
This project is independent of similarly named commercial sky-viewing apps.
