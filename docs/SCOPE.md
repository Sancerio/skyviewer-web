# SkyViewer Web: scope and delivery plan

## Product goal

Let someone open a URL, choose where and when they are observing, and identify
stars and planets without installing an app. The first release emphasizes a
reliable interactive map on desktop and mobile browsers. It is an independent
open-source project, not a clone of another app's branding or assets.

## First-release acceptance criteria

| Journey                 | Expected outcome                                                               |
| ----------------------- | ------------------------------------------------------------------------------ |
| Open the app            | Live UTC clock, clearly labeled default location, real calculated sky          |
| Change location         | Preset, valid manual coordinates, or consented geolocation updates positions   |
| Decline location        | Clear fallback to presets/manual coordinates; usable map remains               |
| Search                  | Name or constellation search across catalog; select to view details and center |
| Object below horizon    | Negative altitude, explicit warning, dimmed map point                          |
| Change time             | UTC input and hour steps update positions; Now resumes live updates            |
| Explore                 | Pointer drag, arrow keys, zoom buttons, +/- keys, reset                        |
| Customize               | Independent constellation, label, grid and night controls                      |
| Phone                   | Readable responsive layout and touch drag; optional heading-only compass       |
| Permissions unavailable | No required permission on startup; explicit fallback messages                  |
| Publish                 | Public source, license and attribution, reproducible tests, static HTTPS site  |

## Architecture

- `src/sky.ts`: pure astronomy and projection functions, input validation.
- `src/data`: pinned original catalog plus deterministic browser subset.
- `src/SkyCanvas.tsx`: Canvas 2D rendering, hit testing, pointer/keyboard input.
- `src/App.tsx`: observing state, controls, accessible object list, dialogs and
  opt-in browser capability handling.
- `src/styles.css`: responsive visual system and night display.
- `src/sky.test.ts`: numerical geometry, astronomical references and invariants.
- `tests/e2e`: repeatable browser journeys, including mocked failure paths.
- `.github/workflows`: build and test before deploying the static artifact.

RA/declination are transformed to observer altitude/azimuth. Stars receive
J2000-to-date precession/nutation; solar-system positions use topocentric
Astronomy Engine results. A gnomonic perspective projection rejects points
behind the camera. Stars below the horizon are dimmed and retain negative
altitudes. Constellation positions are memoized across drag frames.

No database, authentication, location API server, analytics, or runtime third-party
requests are needed. Source data and fonts ship with the site. Hosting is GitHub
Pages. No paid services or API credentials are required.

## Verification strategy

1. Numerical tests: cardinal projections, zenith, equator and polar cases,
   catalog invariants, invalid input, and time/location movement.
2. Browser journeys: load, search, selection, time, presets/manual coordinates,
   keyboard/zoom, toggles, dialogs, denied geolocation and missing compass.
3. Responsive checks: desktop and 390 px mobile, overflow and usable controls.
4. Published smoke test: the same build loads from HTTPS with resolved assets,
   working search and time controls, and no browser errors.
5. Physical checks: iOS Safari and Android Chrome permission UX and compass
   alignment against a known landmark. Simulated sensors do not satisfy this gate.

## Release limits and follow-up roadmap

### v0.1: interactive browser sky (this repository)

Everything in the acceptance table except physical compass certification.
Compass is explicitly experimental and optional. The map works without it.
States reset on reload; no offline installation promise is made.

### v0.2: observing planner

Rise/set times and Moon phase, favorites, local-time display with an explicit
zone, shareable observing links that require deliberate location sharing,
more explanatory object descriptions, full-sky overview, and offline PWA support.
Acceptance: time-zone/DST tests, circumpolar never-rises/never-sets handling,
cache-update tests, and permission-safe share links.

### v0.3: point-to-identify

True device attitude (azimuth + elevation + roll), portrait/landscape handling,
heading calibration and visible accuracy indicators. Optional camera overlay
only after HTTPS camera permissions, sensor/camera alignment, calibration,
permission denial/revocation, and physical iPhone/Android field tests pass.
An ordinary web page cannot guarantee native-app-grade sensor accuracy.

### Later, only when justified

Deep-sky catalog, satellite ephemerides (freshness required), meteor showers,
multiple sky cultures with provenance, accessibility feedback beyond the visual
map, localization, and low-end-device rendering benchmarks. Weather forecasts
would add a network dependency and must remain distinct from geometric visibility.

## Known scientific and UX limits

- Geometric altitude omits refraction and terrain; the horizon is idealized.
- Catalog star proper motion is not applied, so historical/future precision is
  limited; this is an educational map, not an astrometric instrument.
- Magnitudes are explanatory; rendered brightness is illustrative.
- All seven non-Earth planets are included; the faint outer planets usually
  require optics. Above horizon does not mean visible to the naked eye.
- Only western constellation figures are included initially.
- Heading-only compass follows a flat phone's top edge, not its camera direction.
- Touch users zoom with explicit buttons; multi-touch pinch is not yet supported.

## Sources

- [Astronomy Engine](https://github.com/cosinekitty/astronomy): astronomical model,
  transforms and package license.
- [D3 Celestial](https://github.com/ofrohn/d3-celestial): catalog/figure provenance;
  exact pinned paths and notices are in DATA.md.
- [MDN DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent):
  absolute/relative orientation and permission/browser support constraints.
