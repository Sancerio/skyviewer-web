# Permissions and returning-user experience

Updated 2026-09-19. The app's preferences and the browser's permission store are
separate. A saved setting never authorizes access to camera, motion or location.

## Why a Home Screen app may ask again

The W3C Permissions model leaves permission lifetime to the browser/user policy.
Lifetimes can be a document, a browsing session or longer; sensitive media grants
may expire when a context closes. Installing a Home Screen icon is not a contract
for permanent camera or sensor permission. Real iOS behaviour also depends on OS
version and launch context. Safari and Home Screen permissions may be handled
separately; changing Safari's site settings is not a promise for the Home Screen
version.

The WebKit issue linked below records reports about Home Screen camera persistence
alongside an older hash-navigation problem. The original hash bug is marked
resolved; it is not evidence that every current iOS version has that same bug.
This app has no hash routing. Confirm a user's exact prompt and OS version before
attributing a specific failure to WebKit.

## Application contract

| Situation | Behaviour |
| --- | --- |
| First visit | Explain why access is needed, then **Start stargazing**. No hardware request on load. |
| Returning visit | **Welcome back → Open camera**. Remember onboarding and star density, not system grants. |
| Start | Synchronously invoke motion permission in the click stack, then location, then camera. Display the current stage. |
| Denied/cancelled stage | Do not request later stages. Give a specific explanation and next action. |
| Same-document restart | Reuse successful motion authorization, but invalidate on missing sensor data; no persistent permission flag. |
| Recent location | Reuse a valid in-memory fix for less than five minutes on restart. Older fixes are refreshed. |
| Fixed observing place | Explicit opt-in only; round coordinates to 0.01 degrees, label saved/not GPS, provide update and delete. |
| Location edit or Help | Keep the live camera mounted; no router navigation or automatic restart. |
| Motion failure | Retry motion only; keep the existing camera and location. |
| Playback failure | Try `video.play()` on the same stream first; camera reconnect is a separate Help action. |
| Background/lock | Stop media tracks and invalidate pending callbacks. Same-document return offers **Resume stargazing**, without auto-opening capture. |
| Cold launch | Use saved display preferences; ask the browser for current authorization on the next explicit start. |
| Unsupported APIs | Treat permission-query failure as unknown, not denied. Offer the labelled sky map. |

GPS uses one `getCurrentPosition` call, not a simultaneous watch. The UI displays
fix age; active sessions do not continuously track travel. A recent fix is not a
guarantee that the user has not moved. Use **Use current location** to refresh.

The permission-query results in Help are advisory, not proof of live hardware.
No motion grant is inferred from localStorage, onboarding completion or a
`PermissionStatus` for a different capability. A motion pose received while a
retry's permission promise is resolving is retained, not subsequently erased by a
missing-first-sample timeout.

## Copy guidelines

Explain **what happened → what the user can do**, without developer jargon:

- “Motion access is off” → “Enable motion”.
- “Your location is taking longer than usual” → “Try location again”.
- “The camera preview is paused” → “Resume preview”.
- “The camera was interrupted” → “Reconnect camera”.

Do not say every wait is a permission prompt; do not suggest a full reset for a
single feature. Avoid blame, globally enabling camera access, invented Settings
deep links, or promises of permanent permission. Screen-reader live regions are
for status/recovery, not continuously changing compass headings.

## Local storage and privacy

`skyviewer-web.preferences.v1` contains versioned, validated preferences:
`onboarded`, `magnitudeLimit`, and an optional `savedPlace`. There are no stored
permission flags. Invalid JSON, future schemas, invalid coordinates and blocked
storage fall back safely. Explicit save/removal failures are reported.

No analytics or camera/location uploads. No capture is kept active in the
background to avoid a later prompt. No microphone permission is requested.

## Test evidence and remaining physical gate

Unit tests exercise synchronous permission invocation, pending-request deduping,
denial/invalidation, late grant races, cold-document separation and preference
validation. Chromium/WebKit tests assert actual application API-call counts for
fresh starts, retries, location edits, old fixes, reloads, background/resume,
storage failure and cancellation. They retain star/Moon/planet raster assertions.

The harness replaces browser permission APIs. Passing it means the app avoids
redundant calls in those code paths; it does **not** establish how many OS dialogs
appear on a physical iPhone.

On actual iOS Safari and its Home Screen version, record OS/browser version,
launch context and the exact prompt (camera, motion or location), then test:

1. New visit; accept once. Reopen Help and change location without another camera
   request. Deny each stage and recover it independently.
2. Lock/background, return and tap Resume. Verify capture stopped while away.
3. Force-close and cold-launch. Onboarding should stay remembered; record which
   permissions iOS asks again rather than assuming none.
4. Save a fixed place, relaunch and confirm no GPS request; move elsewhere and use
   current location. Remove the saved place and verify it no longer loads.
5. Block/clear website storage and verify startup still works. Recheck optical
   alignment outdoors; this PR does not alter the orientation/ephemeris math.

## Primary references

- [W3C Permissions: lifetime and permission store](https://www.w3.org/TR/permissions/)
- [W3C Device Orientation: requestPermission and user activation](https://www.w3.org/TR/orientation-event/)
- [W3C Geolocation](https://www.w3.org/TR/geolocation/)
- [WebKit reports on standalone camera prompts, with resolved original hash issue](https://bugs.webkit.org/show_bug.cgi?id=215884)
- [WebKit storage policy: local persistence is best-effort](https://webkit.org/blog/14403/updates-to-storage-policy/)
