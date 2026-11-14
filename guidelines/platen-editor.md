# Platen editor

## Layout

- **Left:** a searchable catalog list grouped by kind and type. Buttons there open the catalog popup to add or edit a component; it's the same popup as the Catalog menu.
- **Centre:** the Konva stage.
  - Layers from back to front: platen outline and grid → rails and gutters → components → snap guides and selection.
- **Right:** properties of the selection: X, Y (mm), rotation, length (rails and gutters), tag, locked, and catalog info.

## Placing and moving

- Drag a component from the list onto the platen to create a placement.
- Move it by dragging, or by typing X and Y on the right. Both go through the same snap and validation code.
- Arrow keys nudge by 1 mm; Shift + arrow nudges by 10 mm.
- **Locked** placements can't be dragged, nudged or edited numerically until they're unlocked. They're still selectable.

## Snapping

The snap tolerance defaults to 5 mm and can be changed in user settings. Alt while dragging turns snapping off.

1. **Rail snap**, for `rail_mount` components near a RAIL placement:
   - Vertically, the component's top edge moves to `rail.y − rail_edge_offset`, so the rail's top edge lands where the datasheet says.
   - Horizontally, the component slides freely along the rail, clamped to the rail's length.
   - `rail_id` is set; dragging it off the rail clears it.
   - When the rail moves, every component on it moves with it.
2. **Component snap:** edges align to the nearby edges of other placements (left/right/top/bottom, plus centres).
   - **Stackable** components on the same rail butt up against each other with no gap.
3. **Grid snap** is optional, 5 mm by default. It applies only when nothing above snapped.

## Checks (warnings, not blocks)

- Overlapping bounding boxes are highlighted in red.
- A placement outside the platen is highlighted.
- A component deeper than the cabinet depth minus the platen offset is flagged once a platen offset field exists.

## Saving

- Changes save on drop or on input blur, using optimistic updates. A failure rolls the change back and shows a toast.
- Undo/redo works inside the editor session, through a command stack.
