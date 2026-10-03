# Boiler realism upgrade — source lock and gap analysis

Baseline: `ed407eee5007f196fffaedce815a8511fc7fdf4f`.
Rollback: `checkpoint/boiler-before-realism-2026-10-02`.
Development: `work/boiler-3d-realism-v2`.

## Source and visual lock

Retain the existing React/TypeScript/Three.js implementation, semantic component names, all five learning modules and their content. Process Equipment Atlas is a read-only reference for its navy workspace, restrained orange selection, compact panels, industrial construction hierarchy and authored study views. Its fired-heater geometry is not boiler source material.

Primary engineering reference: the supplied 61-page Arabic boiler training PDF. Pages 11–18 describe water-tube concepts; pages 18–22 cover the horizontal fire-tube package, fittings and burner; pages 22–28 cover ignition, flame detection and fuel; pages 29–41 cover level, gauge glasses, pressure protection, safety valve and blowdown; pages 50–51 cover economizer; pages 57–60 cover operating sequence. Dimensions and construction are generic educational decisions, not an OEM certified design. Example source setpoints/timings are not universal.

Refero live research was unavailable because its subscription returned `NO_SUBSCRIPTION`. The user's explicit existing-product benchmark is the primary visual authority. Both current deployed app bundles were fetched intact and captured locally at desktop/mobile widths; the cloud browser itself has WebGL disabled. No reference-repository writes are permitted or performed.

| Area | Current gap | Implementation target |
|---|---|---|
| Geometry | Solid cylinders masquerade as shell, door rings, tube sheets and tubes | Real hollow pressure shell, annular interfaces, perforated tube sheets, tube bores and exposed wall thickness |
| Materials | High metalness on painted components; dark color maps multiply already-dark colors | Painted enamel vs bare steel vs cast iron, neutral microtexture and roughness/bump variation |
| Lighting | No reflection environment; shadow frustum left at small defaults; black internals | Self-contained studio IBL, configured soft shadows, neutral key with cool separation and local furnace light |
| Camera | Maximum-dimension heuristic ignores aspect; mobile clips burner; labels affect bounds | Geometry-only bounds, projected aspect-aware fit, authored hero and close-ups |
| Animation | Sine bands make flame mechanically regular | Layered advected turbulence, softer envelope, blue attachment and bounded light flicker |
| Industrial details | Full disks cover bores; supports are complete rings; square elbows | Layered flanges/bolts/gaskets, saddle arcs, ribs, brackets and routed curved utility piping |
| Boiler authenticity | Water level below upper tubes; economizer header/tube connections inconsistent | Submerged heating tubes, common normal water level, connected gauge and feedwater heat-recovery circuit |
| Cutaway | Remaining shell also translucent; wrong-side world clip; supports obstruct internals | Opaque rear pressure boundary with deliberately removed near skin, section edges and furnace opening |
| Interaction | Shared materials leak state across shell/utilities; clipped geometry can intercept picks | Per-component/kind material ownership, preserve physical clips, skip invisible/clipped hits |
| Environment | Strong cyan grid; blowdown below ground | Subtle industrial floor, visible skid anchoring and above-floor blowdown routing |
| Performance | Unique bolt draw calls, repeated geometry, unconditional animation | Instanced fasteners/fins/tubes, reusable resources, pixel-ratio cap, reduced-motion and hidden-page handling |
| Mobile | Details sheet covers most of model; no reframing on panel open | Smaller detail sheet, separate remaining canvas space and aspect-aware refit |
| UI integration | Existing visual family already matches reference | Preserve navigation, search, component workflow, all modes and content; improve only density/legibility where needed |

## Acceptance evidence

Capture equivalent normal/cutaway/x-ray, burner, level and exploded views; verify all semantic selections, fit/reset/zoom, flow, labels, touch orbit/pinch, all five modules and the two type models. Run TypeScript and production build; verify repository-relative asset paths and deployed Actions result. Treat software-renderer timings as regression observations, not real-device mobile FPS claims.
