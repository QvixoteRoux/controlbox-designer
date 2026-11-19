# Bugs and corrections

Open ones first. When one is fixed, move it to "Fixed" with the date and commit.

## Open

- **Middle button drags a rail's length handle.** `Konva.dragButtons` is global, so enabling middle-drag for parts also lets the middle button drag the length handle (2026-11-18).
- **Type fill hidden on parts with a warning.** The red warning tint wins over the type's fill colour (2026-11-18).
- **Dimension labels may overlap** on rails or gutters with very close values. Tune `DIM_FIRST` / `DIM_STEP` in `apps/web/src/features/layout/drawing.ts` after seeing it (2026-11-18).
- **Flaky API test timeouts under load.** A full API run once timed out on 3 project tests while the dev servers were running; they passed on rerun (2026-11-17).

## Fixed

- **Revision copy dropped terminal strip fields** (count, colour, group label, bridges): caught before commit and covered by a test (2026-11-17, `dcf1206`).
- **Released snapshots after the catalog changes** (`stackable` → `snappable`, `expandable`, `fillColor`): the migrations rewrite them. Checked on a copy of a real database with a released revision: 25 of 25 snapshots match the new schemas (2026-11-18; migrations from `28e7452`, `ae283f7`, `66368a8`).
- **Terminal dividers invisible in dark mode:** drawn in a colour that contrasts with each housing colour (2026-11-17, `dcf1206`).
