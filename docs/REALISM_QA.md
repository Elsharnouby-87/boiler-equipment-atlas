# Boiler Equipment Atlas — realism upgrade QA

Development branch: `work/boiler-3d-realism-v2`.
Rollback branch: `checkpoint/boiler-before-realism-2026-10-02` at `ed407eee5007f196fffaedce815a8511fc7fdf4f`.

## Implementation

The existing application and five learning modules were retained. The main equipment remains a generic horizontal three-pass fire-tube training boiler. The Process Equipment Atlas repository was inspected read-only; no heater geometry or heater asset was substituted into the boiler.

- Actual hollow pressure-shell/furnace/fire-tube geometry and perforated tube sheets, with smooth wall normals and visible end thickness.
- Lower-arc saddles, skid and machinery supports, feet, handholes, door dogs/hinges, annular flanges and instanced fasteners.
- Twin connected level glasses share the boiler's normal-water-level datum; the heated tubes remain submerged.
- Connected feedwater/economizer circuits, finned heat-transfer bank, routed steam/relief/blowdown piping and open stack. External-system connections terminate in visible interfaces.
- Painted enamel, steel, cast surfaces, glass, water and refractory have distinct material responses. Self-contained studio IBL, configured shadows and local furnace lighting replace the previous crushed-black appearance.
- Layered turbulent flame with blue attachment and restrained light falloff. Operation now suppresses flame/fuel during pre-start, purge and shutdown and distinguishes pilot ignition from main firing.
- Authored close-ups and aspect-aware bounds fitting; fixed-size/de-cluttered labels; a separate remaining mobile canvas when the inspector opens.
- Shared/instanced construction, static batching, bounded pixel ratio, cached shadows, hidden-page/reduced-motion behavior, stable selection callbacks and explicit geometry/material/texture/instance/context cleanup.

## Verification

Production-build verification passed on 3 October 2026. [Browser results](qa/browser-results.json) record the full interaction and resource checks; [release results](qa/release-results.json) record the final combustion-state and settled mobile-layout checks.

Local reproducible checks:

```sh
npm ci --no-audit --no-fund
npx tsc --noEmit
node scripts/verify-geometry.mjs
npm run build
git diff --check
```

The geometry check verifies 34 submerged heating tubes, furnace clearance, all 35 tube-sheet through-openings, an actual hollow-cylinder bore, and 18 projected viewport/orientation fits. Node 22.18+ or Node 24 can load the test's erasable TypeScript import.

Browser coverage: all 18 semantic selections; visible-geometry picking; search/Enter; normal/cutaway/x-ray/exploded; focus/isolate/fit/zoom; labels and flow; repeated-selection resource counts; all five modules and both type models; 1440 × 900, 1366 × 768, 768 × 1024, 1024 × 768 and 390 × 844; touch orbit/pinch; panel separation; asset responses, console/runtime errors and finite camera transforms; WebGL-disabled fallback.

Results:

- TypeScript, geometry verification, clean dependency installation, production build and whitespace checks passed.
- Browser runs recorded no console/runtime errors or missing assets. The WebGL-disabled fallback retained the learning interface and all 18 component controls.
- Geometry/texture counts remained at 162/39 across three repeated-selection cycles after label warm-up. This verifies stable GPU resources for that interaction sequence.
- All seven Operation steps passed the combustion-state check: pre-start, purge and shutdown have no main flame; ignition uses the pilot; firing steps use the main flame. When an unrelated component is isolated, hidden furnace geometry is intentionally absent from its visible-flame count.
- At 390 × 844, the settled model canvas ends at y=469.53 and the inspector begins at y=481.53, ending at y=836. The initial browser-results layout sample was captured during the opening animation; release-results contains the authoritative settled measurement.
- The mobile hero rendered 164 draw calls and 112,152 triangles before label warm-up. Static batching reduced desktop calls from approximately 1,009 during early upgrade development to approximately 305. This is an internal implementation comparison, not a benchmark against the original deployed application.

## Visual evidence

Before captures use the exact original deployed application bundle. After captures use the production build. Normal/cutaway views use comparable front three-quarter views at the same desktop resolution; the improved authored camera is deliberately reframed, so the camera matrices are not identical.

| View | Before screenshot | After screenshot |
|---|---|---|
| External | boiler-before-normal.png | boiler-after-normal.png |
| Cutaway | boiler-before-cutaway.png | boiler-after-cutaway.png |
| Mobile hero | boiler-before-mobile.png | boiler-after-mobile.png |

The PNG evidence accompanies the delivery as standalone files. Additional captures include boiler-after-burner.png, boiler-after-mobile-burner.png, boiler-after-type-fire-tube.png, boiler-after-type-water-tube.png, boiler-after-level-gauge.png and process-atlas-reference.png. The reference was captured read-only.

## Practical limits

The cloud browser has WebGL disabled. Visual and touch QA therefore use a local Chromium headless shell with SwiftShader; the original live bundles were securely fetched and mirrored for the before/reference captures. These are actual application renders, not generated mockups. The native agent-browser daemon could not bind its required Unix socket in this environment, so Playwright provided equivalent browser checks.

Software-renderer timings are not hardware desktop/mobile FPS benchmarks. Geometry and texture counts test GPU resource stability during repeated selection, not a full long-duration heap audit. The model is generic training geometry with illustrative flows, not an OEM design, CFD model or certified operating procedure.

The final focused capture harness limits rendering to four frames per second to make software-renderer screenshots practical. The production application is not subject to that harness limit. Performance statistics above describe geometry and draw-call workload, not achieved frame rate.

The production build retains a non-blocking Three.js core chunk-size advisory (about 528 kB minified, 134 kB gzip). Repository-relative Vite asset paths are preserved. CI uses the committed lockfile and runs TypeScript, geometry verification and production build before Pages deployment.
