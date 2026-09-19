# Automatic camera AR: operation, architecture and verification

Updated 2026-09-19. This document supersedes earlier manual-calibration and
camera-only interface descriptions in the historical scope/verification documents.

## User flow

1. Open on HTTPS in Safari or Chrome and tap **Start AR · use my location**.
2. Allow the browser's location, motion and rear-camera requests.
3. Point at the sky. There is no mandatory location picker or north calibration.

`DeviceOrientationEvent.requestPermission(true)` runs in the original start-button
click stack, before any async camera or GPS work. Camera capture begins after
motion permission is granted where that permission API exists. GPS acquisition
starts from the same user action, with a quick initial fix and high-accuracy watch.
The watch refines the sky automatically. No default city is passed off as GPS.

Denied/unavailable location, motion, rear camera and playback have distinct
messages and retry actions. A real compass reference is required for camera
labels. Relative-only yaw is never silently treated as north. **Explore sky map
instead** works without a camera or compass, using drag or arrow keys, and is
explicitly labelled *not camera-aligned*. Location is still required for a local
sky; city presets and coordinates are an optional recovery/exploration path.

## Orientation and rendering

- `compass.ts` accepts W3C absolute events and iOS `webkitCompassHeading`, including
  the common iOS case where `event.absolute` is false. Invalid/null angles and
  invalid compass accuracy do not establish a north reference.
- `declination.ts` computes the WMM2025 east-positive magnetic-to-true-north
  correction locally from coordinates and date. It uses degree/order 12 Schmidt
  semi-normalised harmonics on WGS84, without a network service or new dependency.
  Its 12 fixtures are NOAA's published WMM2025 test values (tolerance 0.01 degrees).
  Dates outside 2025–2029, geographic poles and weak horizontal fields are marked
  unavailable rather than silently treated as zero declination.
- `orientation.ts` retains the W3C Z-X-Y rotation into east/north/up, rear-camera
  projection, roll, screen orientation and `object-fit: cover` field-of-view math.
- `useARSession.ts` installs sensor listeners before waiting for the camera,
  coalesces events with animation frames and prefers current absolute readings.
  Only a missing first pose times out. Sensor silence while stationary is legal;
  it no longer deletes a valid attitude after three seconds.
- `CameraAR.tsx` computes current-time, observer-specific ephemerides every five
  seconds. Above-horizon stars through magnitude 6 and the solar-system objects
  are projected. Below-horizon targets are explicitly explained, not drawn above
  the ground. Search and turn/tilt guidance remain available.
- `drawAR.ts` draws filled stellar discs, distinct planet markers, a phase-aware
  Moon whose illuminated limb points toward the projected Sun, horizon/cardinals
  and readable labels. Label collisions never erase the underlying object.
- `ar.css` explicitly layers video at z=0, canvas at z=1, controls above them.
  Canvas backing stores resize only with viewport/DPR changes, not each pose.

Markers are intentionally enlarged. Moon phase and Saturn rings are illustrative,
not resolved camera imagery. Stars shown in daylight are a guide, not a promise
that a camera or the unaided eye can see them.

## Lifecycle and privacy

Stopping, closing, page hiding and unmounting release camera tracks and location
watches. Generations invalidate delayed GPS/camera callbacks, so a late result
cannot overwrite a selected location or reopen a cancelled camera. Mute pauses
labels; unmute restores them without a calibration step. Track end and rejected
video playback produce explicit recovery states. Detected front/unverifiable
cameras are not represented as rear-camera AR. Audio is always false.

The app never records, uploads camera frames, sends coordinates to an API, or
persists sensitive location data. Static hosting and OS/browser location services
have their own policies. External information links load only when opened.

## Automated coverage

Run `npm test`, `npm run build`, and `npm run test:e2e` (Chromium and WebKit installed).
The suite retains astronomical/projection/search unit tests and adds automatic
compass, invalid-input and WMM2025 tests. Browser tests use mocked permissions,
media tracks, geolocation and synthetic orientation in Android-like Chromium and
iPhone-like WebKit. They cover:

- One-gesture GPS/camera/motion startup; no premature permission request.
- iOS compass with relative `alpha`, tilt, absolute Android readings, landscape.
- Real canvas pixels and tap selection for a catalog star, Moon and Saturn,
  aimed using their actual ephemeris positions rather than fabricated object data.
- Stationary pose retention, early sensor events during a pending camera, GPS
  refinement, invalid compass data and first-sensor timeout.
- Denials, missing rear camera, playback failure, mute/unmute, track end, stop,
  pagehide, late camera/GPS cancellation and manual fallback.
- Explicit sky-map fallback, keyboard exploration and narrow-screen layout.

Screenshots produced by these tests are **synthetic**, not camera-to-sky evidence.

## Physical-device acceptance gate (not yet verified)

Test on actual iPhone Safari and Android Chrome, outdoors over HTTPS:

1. Start from a fresh page, grant permissions and obtain a real GPS fix without
   selecting a city or aligning north. Repeat deny/retry paths.
2. Centre the Moon and at least two well-separated bright stars/planets. Record
   label-to-object angular residuals, device/browser version, time and location.
3. Repeat upright, tilted through the horizon, near the zenith, in landscape and
   with roll. Check manufacturer-specific compass-heading conventions and camera
   selection; synthetic sensor tests cannot establish these hardware behaviours.
4. Hold still, turn through north, lock/background/reopen, and confirm the camera
   indicator switches off on stop. Confirm sky-map fallback on unsupported hardware.

The 65-degree estimated long-edge FOV is crop-aware, not a calibrated intrinsic
matrix. Sensor bias, magnetic interference, camera/IMU offsets and lens distortion
remain possible. WMM corrects global magnetic variation, not local interference.
Do not claim native-app optical precision or a particular angular error until
physical-device evidence is collected. The app does not use WebXR visual tracking.

## Sources

- W3C orientation: https://www.w3.org/TR/orientation-event/
- W3C media capture: https://www.w3.org/TR/mediacapture-streams/
- WebKit magnetic heading source: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm
- NOAA/BGS WMM2025: https://doi.org/10.25921/aqfd-sd83
- NOAA reference fixtures: https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt
- Catalog and astronomy provenance: [DATA.md](DATA.md)
