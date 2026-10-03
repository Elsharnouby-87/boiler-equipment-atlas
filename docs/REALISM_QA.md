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

Final browser verification is being completed before publication. The committed browser-results file records the final assertions and resource samples.

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

## Visual evidence

Before captures use the exact original deployed application bundle. After captures use the production build. Normal/cutaway views use comparable front three-quarter views at the same desktop resolution; the improved authored camera is deliberately reframed, so the camera matrices are not identical.

| View | Before | After |
|---|---|---|
| External | [Original](qa/before-normal.png) | [Upgraded](qa/after-normal.png) |
| Cutaway | [Original](qa/before-cutaway.png) | [Upgraded](qa/after-cutaway.png) |
| Mobile hero | [Original](qa/before-mobile.png) | [Upgraded](qa/after-mobile.png) |

Additional evidence: [burner](qa/after-burner.png), [mobile burner with details](qa/after-mobile-burner.png), [fire-tube type](qa/after-type-fire-tube.png), [water-tube type](qa/after-type-water-tube.png), and the [read-only Process Atlas benchmark](qa/reference-normal.png).

## Practical limits

The cloud browser has WebGL disabled. Visual and touch QA therefore use a local Chromium headless shell with SwiftShader; the original live bundles were securely fetched and mirrored for the before/reference captures. These are actual application renders, not generated mockups. The native agent-browser daemon could not bind its required Unix socket in this environment, so Playwright provided equivalent browser checks.

Software-renderer timings are not hardware desktop/mobile FPS benchmarks. Geometry and texture counts test GPU resource stability during repeated selection, not a full long-duration heap audit. The model is generic training geometry with illustrative flows, not an OEM design, CFD model or certified operating procedure.

The production build retains a non-blocking Three.js core chunk-size advisory (about 528 kB minified, 134 kB gzip). Repository-relative Vite asset paths are preserved. CI uses the committed lockfile and runs TypeScript, geometry verification and production build before Pages deployment.
