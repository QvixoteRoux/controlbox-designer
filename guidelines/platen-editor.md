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

No tolerance setting (owner, 2026-11-17): snapping is about parts on a rail sitting **side by side**. A fixed internal tolerance decides when something is "near". Alt while dragging turns snapping off.

1. **Rail snap**, for `rail_mount` components near a RAIL placement:
   - Vertically, the component's top edge moves to `rail.y − rail_edge_offset`, so the rail's top edge lands where the datasheet says.
   - Horizontally, the component slides freely along the rail, clamped to the rail's length.
   - `rail_id` is set; dragging it off the rail clears it.
   - When the rail moves, every component on it moves with it.
2. **Component snap:** edges align to the nearby edges of other placements (left/right/top/bottom, plus centres).
   - **Stackable** components on the same rail butt up against each other with no gap.
3. **Grid snap**: 5 mm, switched on or off in the toolbar. It applies only when nothing above snapped.

Built so far: grid snap only (part 1). Rail and component snap come in part 2.

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
