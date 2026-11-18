# Platen editor

## Layout

- **Left:** a searchable catalog list grouped by kind and type. Buttons there open the catalog popup to add or edit a component; it's the same popup as the Catalog menu.
- **Centre:** the Konva stage.
  - Layers from back to front: platen outline and grid → rails and gutters → components → snap guides and selection.
- **Right:** properties of the selection: X, Y (mm), rotation, length (rails and gutters), tag, locked, and catalog info.

## Rails and gutters

- Drawn **horizontally at 0°** (the default): the length runs along x and the profile width (35 mm for DIN rail) along y. 90° makes them vertical (`footprint()` / `rotatedSize()` in `packages/shared/src/layout.ts`).
- A new one gets its catalog stock length (2000 mm). Cut it by typing the length or dragging the handle at its far end.

## Placing and moving

- Drag a component from the list onto the platen to create a placement.
- Move it by dragging, or by typing X and Y on the right. Both go through the same snap and validation code.
- Arrow keys nudge the selection by 1 mm; Shift + arrow nudges by 10 mm. A part on a rail only slides along it (clamped), like a typed position.
- **Selection:** click selects a part; Shift / Ctrl + click adds or removes one; Shift + drag on the background selects every part the rectangle touches; Ctrl + A selects all; Esc clears.
- **Several parts:** dragging one of them moves them all by the same distance (only the dragged part snaps). Parts on a rail that is also selected ride with the rail; parts on a rail that stays slide along it. Delete removes the selection; the panel offers Lock all / Unlock all.
- **Locked** placements can't be dragged, nudged or edited numerically until they're unlocked. They're still selectable, and a multi-select move or delete leaves them alone.

## Snapping

No tolerance setting (owner, 2026-11-17): snapping is about parts on a rail sitting **side by side**. "Near" is a fixed 8 screen pixels. Alt while dragging turns all snapping off (and takes a part off its rail). The code is `snapMove()` in `packages/shared/src/snap.ts`; the rail geometry and `withPatch()` are in `layout.ts`, shared by the editor and the API.

1. **Rail snap**, for `rail_mount` components whose centre is over a RAIL placement (within half the part's own size across the rail):
   - **The part follows the rail's orientation** (owner, 2026-11-17): 0° on a horizontal rail, 90° on a vertical one. Its width always runs along the rail.
   - Horizontal rail: the part's top edge goes to `rail.y − rail_edge_offset`, so the rail's top edge lands where the datasheet says. Vertical rail (part turned 90° clockwise, top edge facing right): the part's right edge is `rail_edge_offset` right of the rail's right edge.
   - No `rail_edge_offset` in the catalog: the part is centred on the rail.
   - It slides along the rail (on the grid when grid snap is on), clamped to the rail's length.
   - `rail_id` is set; dragging it clearly away clears it. "Take off" in the properties panel clears it without moving the part.
   - **Stackable** parts on the same rail butt up against each other with no gap.
   - Dropping a part from the list onto a rail snaps it the same way. Typed X / Y on a part on a rail keeps it on the rail (clamped).
2. **The rail carries its parts**: moving, turning or resizing a rail moves the parts on it, keeping their distance along it. Locked parts come along too (they're locked to the rail). A part on a rail can't be turned on its own. Deleting the rail leaves its parts where they are, off the rail.
3. **Alignment:** other drags line up left / centre / right and top / centre / bottom with nearby parts and the platen edges, with a pink guide line.
4. **Grid snap**: 5 mm, switched on or off in the toolbar. It applies only on an axis where nothing above snapped. Typed values are never rounded to the grid.

A part on a rail that hangs past the rail's end (after shortening the rail) gets a warning.

## Terminal strips (owner request 2026-11-17)

- A placed TERMINAL_BLOCK or GROUND_TERMINAL is a **strip**: `count` identical terminals side by side along the rail (1–200), one placement. Its length along the rail is count × the catalog width (the pitch, e.g. 5.1 mm for a WDU 2.5). It snaps, stacks, turns with its rail and warns past the rail's end like any rail part. Changing the count keeps the strip's start end where it is.
- TERMINAL_BLOCK strips also have:
  - an optional **group label**, drawn outside the strip's top edge (its right edge on a vertical rail)
  - **bridged levels**: levels whose terminals are all joined by a bridge (cross-connector) across the whole strip, drawn as an orange bar at that level. Level 1 is nearest the part's top edge. To bridge only part of a strip, split it into two strips.
  - a **colour**: light grey (default), dark grey, beige, red, green, blue or yellow.
- GROUND_TERMINAL strips: count only. Always drawn half green, half yellow; no label, bridge or colour.
- A divider line is drawn across the strip between each pair of terminals (contrasting colour, over the bridges) when they're at least 2 px apart on screen, so the terminals can be counted. The caption shows the part number (or tag), a divider, and "N pcs".
- Terminal numbering: not done; the group label only (owner).
- **Open (owner, 2026-11-17):** end plates. Usually one per strip/group, vendor-specific (e.g. WAP 2.5-10, 1.5 mm). Not modelled yet. Bridges are drawn but not listed as parts (no BOM yet).

## Checks (warnings, not blocks)

- Overlapping bounding boxes are highlighted in red.
- A rail or gutter longer than its catalog stock length (2000 mm by default) is flagged.
- A placement outside the platen is highlighted.
- A component deeper than the cabinet depth minus the platen offset is flagged once a platen offset field exists.

## Saving

- Changes save on drop or on input blur, using optimistic updates. A failure rolls the change back and shows a toast.
- Every editor write goes through `POST …/cabinets/:id/layout/changes`: a list of create / update / delete changes applied in order in **one transaction** (all or nothing). It returns the whole layout. A create carries a negative `tempId` that later changes in the same batch can use as an id or `railId`.
- **Undo / redo** (Ctrl + Z, Ctrl + Y or Ctrl + Shift + Z, and toolbar buttons) work inside the editor session, up to 100 steps. Each step keeps the layout before and after it; undo / redo send the batch that turns the current layout into that state (`changesTo()` in `apps/web/src/features/layout/history.ts`). Re-created parts get new ids, and every step is renamed to them. Held-down arrow nudges of the same selection merge into one step. Leaving the page forgets the history.
