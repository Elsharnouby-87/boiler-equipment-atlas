# Boiler Equipment Atlas

Interactive 3D training atlas for industrial steam boilers.

## Purpose

This project is the boiler-focused companion to **Process Equipment Atlas**. It intentionally preserves the same dark industrial visual language, three-panel learning layout, interactive Three.js approach, focus/isolate workflow, global module navigation, mobile behavior, and GitHub Pages deployment pattern.

## Current modules

- **Atlas** — interactive 3D fire-tube boiler anatomy
- **Components** — combustion/gas path, pressure vessel, water/steam, controls, safety and blowdown
- **Boiler Types** — interactive 3D fire-tube vs water-tube comparison
- **Operation** — pre-start, purge, ignition, flame proving, warm-up, normal operation and shutdown learning journey
- **Troubleshooting** — low water, high pressure, flame failure, feedwater failure, false level, scale/deposits and soot/fouling

## 3D master model

The main Atlas uses a schematic horizontal **three-pass fire-tube boiler** so the learner can inspect the complete gas route: burner → furnace (Pass 1) → rear turnaround → Pass 2 fire-tube bank → front turnaround → Pass 3 fire-tube bank → rear collection → economizer → stack.

- Boiler shell / pressure boundary
- Burner and ignition
- Furnace tube
- Fire-tube bank
- Tube sheets
- Front and rear smokeboxes
- Flue outlet / stack
- Water and steam spaces
- Feedwater inlet
- Steam outlet
- Gauge glass
- Level sensors
- Pressure controls
- Safety valve
- Blowdown valve

The 3D geometry is **training geometry, not a certified OEM design**.

## Technical source basis

The operating and boiler-learning content was developed from the project-supplied Arabic boiler training document **الغلايات.pdf**. The source emphasizes fire-tube and water-tube boiler types, boiler fittings and controls, water-level protection, pressure controls, safety valves, feedwater and blowdown, startup/purge/ignition sequence, cold-start warm-up, daily checks, water treatment and common operating problems.

Where the source gives example timings or settings, the UI labels them as training examples and explicitly directs the learner to the actual OEM/BMS/site procedure for field operation.

## Development

```bash
npm install
npm run dev
```

Production QA:

```bash
npx tsc --noEmit
npm run build
```

## GitHub Pages

Deployment is defined in `.github/workflows/pages.yml`.

For a newly created repository, GitHub Pages must be enabled once under:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

After that, pushes to `main` build and deploy automatically.

## Design lineage

UI foundation: [Process Equipment Atlas](https://github.com/Elsharnouby-87/process-equipment-atlas)

Boiler Atlas repository: [boiler-equipment-atlas](https://github.com/Elsharnouby-87/boiler-equipment-atlas)
