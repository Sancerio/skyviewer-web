# README media

Captured on 2026-09-24 from app revision `ed231bd` using the managed Codex browser
at a 390 × 844 CSS-pixel viewport. No app code or browser APIs were modified.
The public London city preset was used; no device location, camera or motion
permission was requested.

- `setup.jpg`: first-visit startup with automatic location and camera-free options.
- `location.jpg`: current location picker with presets and coordinate inputs.
- `sky-map.jpg`: camera-free London sky, explicitly labelled as not camera-aligned.
- `object-details.jpg`: Jupiter information in the camera-free flow.
- `setup-walkthrough.gif` / `.mp4`: the same 22-second, silent walkthrough,
  assembled from actual browser screenshots at two frames per second. Frames
  hold each step for readability; this is not a continuous real-time recording.

Sequence: startup → location picker → choose London → Explore without camera →
search Jupiter → select Jupiter → Information.

The preview shows real map rendering, search and information. It does not show
live camera capture, hardware permission prompts or sensor alignment, and is not
an outdoor accuracy test. A full AR recording still requires a physical phone.

To refresh: run `npm run dev`, capture these steps in a managed browser at the same
viewport, allow sheets to settle before capture, and encode with FFmpeg. Update
the README caption and provenance when the demonstrated flow changes. Images in
`docs/screenshots` belong to an older interface and are not used in this preview.
