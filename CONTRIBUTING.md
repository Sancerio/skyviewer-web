# Contributing

Open an issue describing the observing journey or bug, then make a focused pull
request. Use Node 22.12+ and `npm ci`. Keep astronomy in the pure core, UI in the
components, and retain data provenance. Do not add telemetry or share coordinates
implicitly. Any new permission must be opt-in with a usable denial path.

Run `npm test`, `npm run build`, and the Linux Playwright suite. Add meaningful
regression coverage for changed behavior. Include desktop and mobile screenshots
for visual changes. Sensor changes need physical iOS and Android evidence;
emulation alone does not establish accuracy. Keep app code MIT-compatible and
preserve notices for third-party data and assets.
