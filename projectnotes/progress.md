# Progress

What was built or changed, oldest first, with the commit. Details of each rule live in `guidelines/`; decisions in [decisions.md](decisions.md). Entries before 2026-11-18 were rebuilt from git history after the original untracked log was lost.

## 2026-11-14 to 2026-11-16: foundations

- `9cd1c10` Workspace scaffold: pnpm monorepo, `apps/web`, `apps/api`, `packages/shared`.
- `8c8c1a3` PostgreSQL 18 local setup documented (`guidelines/stack.md`).
- `39aab48` Login, server-side sessions, user administration, permissions (`can()`).
- `96f1da4` Projects, machines and revisions: release with notes freezes a revision (snapshots); the next revision starts as a copy.

## 2026-11-17: cabinets, catalog, platen editor

- `1dc634a` Cabinets, openings on each face (windows, round and rectangular holes, cable glands, gland arrays), with overlap and off-face warnings. Face origin moved to the top-left corner (migration `opening_origin_top_left`).
- `20554b5` Component catalog with per-kind fields, Types page (cabinet and component types), pictures (local image store), components mounted in round holes.
- `5015562` Platen editor part 1: part list, canvas with zoom, pan and grid snap, drag from the list, rail / gutter length handle, lock, warnings. Built-in DIN rail (migration `builtin_din_rail`). Rotation limited to 0° / 90° (migration `rotation_0_90`).
- `35f62ff` Part 2, snapping: rail snap by rail edge offset, side by side, turning with vertical rails; a rail carries its parts (also in the API); alignment guides; grid fallback; Alt turns snapping off.
- `dcf1206` Part 3, terminal strips: count, colour, group label, bridged levels; "N pcs" caption and dividers (migration `terminal_strips`).

## 2026-11-18

- `be34bf0` Part 4: batch endpoint `POST …/layout/changes` (one transaction); undo / redo (100 steps, nudges merge); multi-select (Shift / Ctrl + click, Shift + drag area, Ctrl + A); group drag; arrow-key nudge; delete; lock all.
- `fb38d31` README and AGPL-3.0 license; repo pushed public.
- `ea65ea1` Part captions rotated 90° counterclockwise (rails and gutters excepted); caption font cap 13 px.
- `28e7452` Catalog flag `stackable` renamed to `snappable`, on by default; released snapshots rewritten (migration `rename_stackable_to_snappable`).
- `1685def` Dragging a part on a rail moves its unbroken row; middle-drag moves one part.
- `51396a4` Safety component kind (migration `safety_kind`).
- `2e2638f` Rail and gutter captions show the cut length in mm and inches; rail captions lifted off the centre line.
- `ae283f7` Expandable parts placed as a row of modules (migration `expandable_parts`).
- `66368a8` Part list grouped by kind and type; component type fill colours (migration `component_type_fill_color`).
- `1090ed5` Dimensions toggle: X/Y dimension lines for rails and gutters.
- `5548686`, `5090929` Export the platen as a PNG drawing sheet (legend, title block, dimensions).
- `af02bd4` Export printable Letter pages at a standard scale, with a grouped parts list.
- `f4f394e` Relay component kind with its base in the same entry (migration `relay_kind`).
- `166b7de` Copy / paste parts on the same platen.
- `b267f5b` 40 mm wire space above and below terminal strips, with warnings.
- Second dev machine brought up to date; snapshot migrations checked on a copy of a database with a released revision (25 / 25 pass). Checks: 315 tests pass.
- `projectnotes/` started (this folder).
- `4aee72d`, `70531e7` README Features rewritten; `CHANGELOG.md` added (upgrade steps, then each change with its commit).
- Untracked notes (`localnotes/`, `agentNotes/`) are shared between the two dev PCs through a synced folder, merged both ways on request (rule in `CLAUDE.md`). `bugs.md`: dimension spacing constants now in `drawing.ts`.
- Cabinets: 1 or 2 doors (migration `cabinet_doors`, hinge side `BOTH`, check `cabinets_doors`); 2 doors fix the hinges and the mounting; one default window per door; "across both doors" warning on FRONT. First change made for the two-session sync practice.
- Notes sync layout: the shared notes folder now holds one folder per PC (named by hostname); each session writes only its own and reads the other's (`CLAUDE.md` rule updated).
- Cabinet doors checked in the browser by the owner (2026-11-19).
- Side labels: every cabinet face view and the platen (editor and both exports) name the face past each edge (TOP, BOTTOM, LEFT, RIGHT, FRONT, BACK), so a side view shows where the others are. `faceNeighbours()` in `packages/shared/src/faces.ts`; `SideLabels` component; export layouts make room for them.
- Bottom plate (2026-11-20): opening kind `BOTTOM_PLATE` (BOTTOM only, rounded corners, `corner_radius`; migration `bottom_plate` rewrites the check `cabinet_openings_shape`). "Bottom plate: yes / no" switch (`PUT …/bottom-plate`) adds one at 70% of the bottom, centred, 10 mm corners. Holes crossing the plate's edge are flagged; holes wholly on or off it aren't.
