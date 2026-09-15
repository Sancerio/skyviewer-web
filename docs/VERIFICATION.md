# Verification

## Automated checks

Run `npm test` for numerical/reference tests and `npm run build` for TypeScript
and production compilation. Run `npm run test:e2e` on Linux for the browser suite.
GitHub Actions gates deployment on these checks. Browser report/trace artifacts
are retained by the workflow, including failure evidence.

## Managed-browser checks (2026-09-15)

In progress during initial development; final evidence is recorded below after
the published-build smoke test.

## Physical-device release gate

The interactive map does not depend on sensors. Experimental compass behavior
has not been verified against real physical iOS or Android devices. Before
promoting compass accuracy or adding camera AR, complete these checks:

- iPhone Safari on HTTPS: allow and decline motion permission, then reload.
- Android Chrome on HTTPS: verify absolute heading is available and falls back
  clearly when unavailable.
- Compare flat-phone heading against a known north-aligned landmark outdoors.
- Check heading near magnetic interference; communicate uncertainty.
- Rotate portrait/landscape and confirm the documented top-edge convention.
- Stop compass, drag manually, background/reopen, and verify cleanup.
- Allow, decline, timeout and revoke geolocation without losing manual controls.

Responsive browser emulation and synthetic sensor events are not physical-device
evidence. No camera, tilt, or native-equivalent alignment claims are made.
