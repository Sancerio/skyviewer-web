# Camera AR: operation and verification

Updated 2026-09-19. This document and [PERMISSIONS.md](PERMISSIONS.md) supersede
older manual-calibration, always-reset, continuous-GPS-watch and camera-only
interface descriptions in historical scope/verification files.

## User flow

First visit: **Start stargazing → Motion → Location → Camera**. Approve requests
when the browser asks, then point at the sky. No city picker, flat-phone alignment
or manual north step is required. Returning visitors see **Open camera**. Capture
stops in the background; return to the same live document with **Resume stargazing**.
A cold Home Screen launch may require iOS permission again, independently of saved
onboarding preferences.

The location picker is optional and stays within the mounted camera session.
Default current-location mode uses a one-shot fix. The HUD labels its age. A fix
older than five minutes is refreshed on restart, or manually via **Use current
location**. Explicitly saved observing places are rounded and labelled as fixed
places, not live GPS. No default Singapore location is assumed.

Errors identify the failing feature and provide targeted retry. Motion retry does
not reopen the camera; preview resume uses the existing stream. **Help with
access** offers explanations and passive browser permission hints. **Explore
without camera** is a drag/keyboard sky map, clearly not camera-aligned.

## Modules

- `useARSession.ts`: camera lifecycle, sequential startup stages, synchronous
  initial motion request, cancellation, pause/resume and motion-only retry.
- `permissions.ts`: live-document motion gate, defensive passive permission
  queries, Home Screen and iOS detection. Grants are never persisted by the app.
- `useObserver.ts`: one-shot GPS, recent-fix reuse, generation guards, chosen and
  opt-in saved observing places.
- `preferences.ts`: versioned validated local preferences, approximate fixed
  places and storage-failure handling.
- `messages.ts`, `Startup.tsx`, `AccessHelp.tsx`: structured recovery messages,
  first/return/paused states and platform-aware help.
- `App.tsx`: in-page location dialog with inert background, no camera remount.
- `CameraAR.tsx`: current sky, live camera/canvas, search, target guidance,
  information/display/help sheets and labelled map fallback.
- `compass.ts`: iPhone `webkitCompassHeading` and Android absolute events;
  rejects invalid angles and invalid compass references.
- `declination.ts`: offline degree/order 12 WMM2025 magnetic-to-true-north
  correction with 12 published NOAA reference fixtures. No external location API.
- `orientation.ts`: W3C Z-X-Y to east/north/up, rear-camera perspective,
  screen orientation/roll and cover-crop field-of-view compensation.
- `drawAR.ts`: filled stellar/planet markers, phase-aware Moon with its bright
  limb toward the projected Sun, horizon/cardinals and collision-managed labels.
- `ObjectInformation.tsx`: source-linked facts; `search.ts`: name/identifier/alias search.

## Rendering and accuracy contract

Current observer/time ephemerides are recomputed every five seconds. Search covers
5,044 bundled magnitude-6 stars, the Sun, Moon and seven planets. Above-horizon
objects are projected through the full device attitude. Below-horizon targets
are explained, not moved into view. Faint-star density is remembered locally.
Labels may be suppressed for overlap, but underlying object markers remain.

Valid stationary poses are retained. The first missing pose times out with a
motion-specific action. Absolute/relative readings are not interchangeable;
relative-only yaw cannot establish north. Camera mute/playback failure prevents
an apparently live aligned overlay until capture/preview resumes.

Video, canvas and controls have explicit stacking layers. Canvas backing size is
changed only for viewport/DPR changes, not every pose update. Sensor events are
coalesced with animation frames. These are application optimizations, not an
assertion of measured physical-device frame rate.

Markers are enlarged for readability. Moon phase and Saturn rings are illustrated,
not resolved camera imagery. Geometric positions omit refraction, terrain,
extinction and light pollution; stars omit proper motion. Lens FOV is estimated
at 65 degrees along the long edge and adjusted for cropping. WMM2025 covers
2025–2029 and does not correct local magnetic interference. Outside validity or
at unavailable polar/weak fields, the UI reports no true-north correction.

## Privacy and lifecycle

No recording, microphone, analytics, frame upload or coordinate service. Capture
stops on stop, close, pagehide, hidden visibility and unmount. Pending callbacks
are generation-guarded; late cancelled camera streams are stopped. The app never
starts hardware on reload or automatically on visible-page resume. LocalStorage
contains display preferences and only explicitly saved rounded places, never
system authorization. More detail: [PERMISSIONS.md](PERMISSIONS.md).

## Verification

Run `npm test`, `npm run build` and the Linux Playwright suite. Numerical tests
cover astronomy, projection, compass and WMM. Browser projects exercise desktop
Chromium, Android-like Chromium and iPhone-like WebKit with synthetic hardware.
Tests assert real rasterized pixels/tap selection for a catalog star, Moon and
Saturn, plus permission-call counts, startup stages, same-session restart,
cold-launch preferences, saved-place consent, Help, cancellation, invalid/absent
sensors, video mute/denial, location edits and page lifecycle.

Screenshots are **synthetic UI evidence**. They cannot establish physical iPhone
permission persistence or camera-to-sky alignment.

Before claiming optical accuracy, test actual iPhone Safari and Android Chrome
outdoors over HTTPS. Record device/browser, UTC, observer place and angular
residuals on the Moon and at least two separated bright targets; repeat at the
horizon, near zenith, in portrait/landscape and with roll. Check camera selection,
compass conventions, background/lock cleanup and permission denial/retry. Browser
intrinsic/lens and camera/IMU offsets can still produce visible errors.

## Primary references

- [Device Orientation and Motion](https://www.w3.org/TR/orientation-event/)
- [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
- [WebKit magnetic-heading source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm)
- [NOAA/BGS WMM2025](https://doi.org/10.25921/aqfd-sd83)
- [NOAA WMM2025 fixtures](https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt)
- [Catalog provenance](DATA.md)

Never aim binoculars or a telescope at the Sun using this app.
