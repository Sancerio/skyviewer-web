# Verification

## Current interface: camera AR only

As of 2026-09-15, the site opens directly to camera setup. Location selection,
permission recovery, search and details belong to that flow. Closing/stopping a
session returns to setup; the map dashboard, time travel and mode selector are
not exposed. Earlier map/fallback descriptions below are historical and are
superseded by this user-requested interface change.

## Automated checks

Run `npm test` for numerical/reference tests and `npm run build` for TypeScript
and production compilation. Run `npm run test:e2e` on Linux for the browser suite.
GitHub Actions gates deployment on these checks. Browser report/trace artifacts
are retained by the workflow, including failure evidence.

## Camera AR v0.2 verification (2026-09-15)

The first camera implementation at `6635ab2` passed [CI run 34971251632](https://github.com/Sancerio/skyviewer-web/actions/runs/34971251632): 37 unit tests, production build, and 36 browser tests. Browser coverage includes 12 map regressions plus 12 synthetic camera/sensor scenarios in each of Chromium and WebKit.

Independent review then found an inverse screen-rotation sign and missing muted-camera handling. Both were corrected and independently rechecked without remaining findings. The numerical suite now has 39 passing tests with physically consistent portrait and both landscape poses. Expanded browser regressions cover projected-star tapping, landscape, failed playback, and muted capture. The final revision's [Actions result](https://github.com/Sancerio/skyviewer-web/actions) is authoritative for their execution and deployment.

Managed-browser checks covered camera setup at 390 × 844 and 844 × 390, scroll access in landscape, and expanded object information. Synthetic screenshots from both engines were inspected; information sheets and status backgrounds were made opaque enough to prevent competing labels behind their text. These screenshots represent mocked camera/sensor state, not an outdoor phone test.

## Managed-browser checks (2026-09-15)

Initial production commit `dbba437` passed [GitHub Actions run 34961951640](https://github.com/Sancerio/skyviewer-web/actions/runs/34961951640): 14 numerical tests, production TypeScript/build, 8 Chromium end-to-end tests, and Pages deployment. Browser tests completed in 11.4 seconds.

The published HTTPS page was verified on 2026-09-15 at approximately 11:13 UTC:
search Saturn, select details, step time, return to Now and reset. Fresh production
browser logs contained zero errors or warnings. The server returned HTTP 200.

Managed desktop and 390 × 844 mobile checks also covered Sirius below-horizon
centering, London/Sydney presets, manual coordinates (0, 0), direct UTC entry,
hour steps, Now, zoom/reset, grid/night controls, the mobile guide dialog, and
compass permission-denial messaging. The mobile document width equaled its
390-pixel viewport: no horizontal overflow.

## Independent review and regression coverage

Independent review identified delayed geolocation overwriting a newer choice and
constellation lines disappearing at viewport edges or high zoom. Both are fixed
with request invalidation and segment clipping. A stale below-horizon banner on
time changes and a zero-size canvas crash during resizing were also corrected. Regression tests cover these changes, invalid
coordinates/dates, and projection boundaries. The [Actions page](https://github.com/Sancerio/skyviewer-web/actions)
contains the final commit's authoritative test/deployment result and downloadable
browser report.

See [desktop](screenshots/desktop.png) and [mobile](screenshots/mobile.png)
for initial published-page captures (before the regression fixes).

## Physical-device release gate (current)

The interactive map does not depend on sensors. Experimental compass behavior
has not been verified against real physical iOS or Android devices. Camera AR is now available as an experimental calculated overlay. Before
promoting physical alignment accuracy, complete these checks and the
[full camera field-test matrix](CAMERA_AR.md#verification-and-remaining-gate):

- iPhone Safari on HTTPS: allow and decline motion permission, then reload.
- Android Chrome on HTTPS: verify absolute heading is available and falls back
  clearly when unavailable.
- Compare flat-phone heading against a known north-aligned landmark outdoors.
- Check heading near magnetic interference; communicate uncertainty.
- Rotate portrait/landscape and confirm the documented top-edge convention.
- Stop compass, drag manually, background/reopen, and verify cleanup.
- Allow, decline, timeout and revoke geolocation without losing manual controls.

Responsive browser emulation and synthetic sensor events are not physical-device
evidence. Camera and tilt code paths have synthetic coverage; native-equivalent or measured optical accuracy is not claimed.
