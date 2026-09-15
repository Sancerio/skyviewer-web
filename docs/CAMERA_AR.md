# Camera AR: operation, architecture and verification

## What this version does

Open **Camera AR**, check the displayed observing location, and tap **Use this
location & start camera**. The app requests motion permission when the browser
requires it, then a rear camera with audio disabled. The camera image stays local:
there is no recording, frame upload, server inference, or microphone request.

The transparent overlay projects catalog stars and calculated solar-system objects
through the device's full orientation: heading, tilt and roll. Screen rotation
and camera video cropping are included. This is a computed sky overlay, not
recognition of light sources in the camera image. It labels predicted positions
even when clouds or daylight hide the actual object.

All 5,044 bundled magnitude-6 stars can be searched, along with the Sun, Moon and
seven planets. AR defaults to stars brighter than magnitude 3.5 to keep labels
readable; **Faintest stars** can expand this to the entire catalog. Selected targets
remain included. Names, Hipparcos identifiers, Bayer designations and constellation
names support search. This finite catalog does not include every astronomical star,
deep-sky object or satellite.

Tap a projected object or a nearby-object button for information. Search for an
object to get turn/tilt guidance. Below-horizon targets are explicitly marked.
Information includes type, constellation where known, magnitude, right ascension,
declination, altitude/azimuth, catalog ID, B−V color index where available, and
observer distance for solar-system objects. Missing stellar distance is explicitly
not bundled; SIMBAD links expose additional catalog information. Solar-system
cards link to NASA. These external pages load only when the user opens a link.

## Calibration on iPhone and Android

- **Absolute orientation available:** use the browser's Earth-referenced pose,
  showing approximate alignment. This is not a guarantee of compass accuracy.
- **Relative-only orientation:** suppress labels until the user establishes north.
  Aim the rear camera toward true north at the horizon and tap **Set camera
  direction to north**. Use a known landmark, not the uncalibrated overlay itself.
- **iOS compass alternative:** with a usable `webkitCompassHeading`, lay the phone
  flat, screen up, and tap **Use flat-phone compass**. The measured heading and
  relative alpha establish a session yaw correction. Magnetic north and true north
  can differ; check a known star and refine the heading correction.
- **Overlay scale:** camera intrinsics are not exposed consistently by browser
  APIs. The initial long-edge field of view is 65 degrees, explicitly estimated.
  Adjust **Camera field of view** to match separation between known stars. Crop
  compensation is automatic, but lens distortion and camera/IMU offsets remain.
- **Reset:** Reset calibration clears heading corrections and restores the lens
  estimate. Stopping/restarting AR starts a new reference. Changing between relative
  and absolute sensor frames also clears old calibration.

AR always uses the current time. Map time travel does not move the camera overlay
to a past/future sky. Location is explicit and can be changed before starting.
No sensor data means no object overlay; stale readings pause labels instead of
leaving an apparently live, frozen sky. Move the phone to resume a current reading.

## Permission and lifecycle contract

No camera or motion request occurs at page load or simply opening setup. The start
button initiates `DeviceOrientationEvent.requestPermission(true)` synchronously
within its user gesture where supported. Camera access follows only when that
request is granted. Both iPhone Safari and Android Chrome use feature detection.

Media selection requests `facingMode: environment` and rejects detected front or
unverifiable cameras. Denial, unsupported APIs, device-in-use errors and camera
track termination lead to an explicit message and a map fallback. Stopping AR,
closing it, navigating away or hiding the page stops every media track and removes
listeners. A late permission/camera response after cancellation cannot reopen the
camera; its returned tracks are stopped. Microphone capture is always false.

## Implementation

- `src/orientation.ts`: W3C Z-X-Y device rotation into east/north/up camera basis;
  screen orientation; rear-camera projection; object-fit cover field of view.
- `src/useARSession.ts`: media and sensor state machine, permissions, cancellation,
  freshness, page/track lifecycle and cleanup.
- `src/CameraAR.tsx`: camera rendering, label selection, search, guidance,
  calibration, live clock and information sheets.
- `src/ObjectInformation.tsx`: source-linked catalog/ephemeris information.
- `src/search.ts`: normalized name, identifier and alias search.

Sources: [W3C device orientation](https://www.w3.org/TR/orientation-event/),
[W3C media capture](https://www.w3.org/TR/mediacapture-streams/),
[MDN permission API](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static),
[NASA solar-system exploration](https://science.nasa.gov/solar-system/),
[SIMBAD](https://simbad.cds.unistra.fr/simbad/), and [catalog provenance](DATA.md).

## Verification and remaining gate

Numerical tests cover known north/west/horizon/zenith poses, rotation/roll,
landscape, rear rejection, calibrated heading and camera crop geometry. Linux
Playwright projects exercise Chromium with Android viewport and WebKit with iPhone
viewport using **mocked camera streams and synthetic sensor events**. They cover
permissions, pose updates, calibration, search/details, cancellation, stopping,
page hiding and sensor freshness. Existing map tests remain in the suite.

These tests prove code paths and numerical conventions; they do not establish real
camera-to-sky alignment. Before calling optical accuracy verified, test both actual
phones outdoors on HTTPS and record:

| Check                                                                | iPhone Safari         | Android Chrome        |
| -------------------------------------------------------------------- | --------------------- | --------------------- |
| Camera/motion allow, deny and retry                                  | Pending physical test | Pending physical test |
| Point at Moon or a known bright star; record angular mismatch        | Pending physical test | Pending physical test |
| Calibrate north and overlay scale; repeat on three separated targets | Pending physical test | Pending physical test |
| Portrait/landscape, roll, zenith and horizon                         | Pending physical test | Pending physical test |
| Stop, lock/background, reopen; camera indicator turns off            | Pending physical test | Pending physical test |
| Return to map with sensors unavailable                               | Pending physical test | Pending physical test |

Record device/browser versions, UTC, observer coordinates, target, heading offset,
lens setting and residual alignment error. Synthetic test screenshots must be
labeled as synthetic; do not substitute them for this field test.
