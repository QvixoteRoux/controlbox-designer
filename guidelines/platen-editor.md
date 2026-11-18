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
- Arrow keys nudge by 1 mm; Shift + arrow nudges by 10 mm.
- **Locked** placements can't be dragged, nudged or edited numerically until they're unlocked. They're still selectable.

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

## Terminal strips (planned, owner request 2026-11-17)

- A placed TERMINAL_BLOCK or GROUND_TERMINAL can be an **array in one direction only**: N terminals side by side along the rail (the narrow direction), one placement with a `count`.
- TERMINAL_BLOCK strips also have:
  - an optional **group label**
  - **bridged levels**: the levels whose terminals are all joined by a metal bridge strip. Drawn as a bar across the group, with a note.
  - a **colour**: light grey (default), dark grey, beige, red, green, blue or yellow.
- GROUND_TERMINAL strips: array only. Always drawn half green, half yellow; no label, bridge or colour.

## Checks (warnings, not blocks)

- Overlapping bounding boxes are highlighted in red.
- A rail or gutter longer than its catalog stock length (2000 mm by default) is flagged.
- A placement outside the platen is highlighted.
- A component deeper than the cabinet depth minus the platen offset is flagged once a platen offset field exists.

## Saving

- Changes save on drop or on input blur, using optimistic updates. A failure rolls the change back and shows a toast.
- Undo/redo works inside the editor session, through a command stack.
