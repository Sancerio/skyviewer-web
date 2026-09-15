# SkyViewer Web

A little closer to the cosmos. A free, open-source sky map that runs in your browser.

[Open the app](https://sancerio.github.io/skyviewer-web/)

## Explore

- 5,044 real catalog stars and all 88 western constellation figures.
- Calculated Sun, Moon, and seven planets, with altitude, azimuth and magnitude.
- Drag, keyboard navigation, zoom, search, and object centering.
- City presets, manual coordinates, and opt-in geolocation.
- Live sky or UTC time travel (1900–2100).
- Constellation, label, coordinate-grid and red night-display controls.
- Camera AR: rear-camera preview with heading, tilt and roll tracking, portrait/landscape support, north calibration and adjustable overlay scale.
- Point-and-learn object labels, catalog/identifier search, target turn/tilt guidance, and information cards with magnitude, coordinates, star color index and solar-system distance.
- Responsive desktop and phone layouts; permission-independent map fallback.
- No account, API key, analytics, or backend. Fonts and catalogs are bundled.

The initial location is explicitly labeled Singapore. It is a preset, not a guess
at your location. Enter another location or request geolocation to change it.
Location and settings live only in page memory and reset on reload. Browser/OS
location services have their own privacy policies; the app does not send your
coordinates anywhere. GitHub Pages serves the static files and may keep normal
hosting access logs.

## Run locally

Node.js 22.12+ or 24 LTS:

```sh
npm ci
npm run dev
```

## Verify

```sh
npm test
npm run build
```

On Linux, run the automated browser suite:

```sh
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

The same tests run in GitHub Actions before Pages deployment. The repository's
browser suite deliberately does not launch local macOS GUI browsers. Use a
managed browser for local Mac checks. See [verification](docs/VERIFICATION.md)
for evidence, test coverage, and the outstanding physical-device checklist.

## Scope and architecture

React + TypeScript + Vite, a Canvas 2D perspective sky renderer, and Astronomy
Engine 2.1.19. Calculations stay on the client. Original pinned catalog files are
retained in `src/data`; `npm run catalog` regenerates the smaller browser subset.

- [Competitive study: SkyView, Sky Guide, Star Walk 2, Stellarium](docs/COMPETITIVE_RESEARCH.md)
- [Camera AR operation and validation](docs/CAMERA_AR.md)
- [Product scope, architecture, and roadmap](docs/SCOPE.md)
- [Data provenance, coordinate conventions, and attribution](docs/DATA.md)
- [Verification plan and results](docs/VERIFICATION.md)
- [Contributing](CONTRIBUTING.md)

## Limits

This is a sky map, not a weather or naked-eye visibility prediction. Geometric
positions omit atmospheric refraction, terrain, extinction and light pollution;
catalog stars omit proper motion. Discs are symbols, not angular sizes or a Moon
phase rendering. Western constellation lines are illustrative figures, not
boundaries. Camera AR uses full device orientation and estimated camera field of view; physical iOS/Android alignment testing remains outstanding. The separate map compass still follows heading only. No satellites, deep-sky images, offline service worker, or telescope control in v0.2.
Never point binoculars or a telescope at the Sun using this app.

## License

Application code: [MIT](LICENSE). Catalog: D3 Celestial BSD-3-Clause with credits
in [DATA.md](docs/DATA.md). Third-party dependency and font notices are included
in [public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt), also distributed
with the built website. This project is independent and not affiliated with
similarly named commercial sky-viewing apps.
