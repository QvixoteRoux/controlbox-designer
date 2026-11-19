# Platen editor

## Layout

- **Left:** a searchable catalog list in collapsible groups: kind, then type (in the types' order, "No type" last; a type with a fill colour shows its swatch). A search opens every group with a match; which groups are open is remembered in the browser. Buttons there open the catalog popup to add or edit a component; it's the same popup as the Catalog menu.
- **Centre:** the Konva stage.
  - Layers from back to front: platen outline and grid → rails and gutters → components → snap guides and selection.
  - **Relays on a base** are one box (the outline of both) for snapping, rails and warnings. They're drawn as the base outline (light fill) with the relay outline centred on it, turned with the part; the box itself only shows when selected or warned. Parts lists add the base as its own row (full sheet: under each relay; letter legend: counted together as "Relay base").
  - **Captions** (part number, or the tag when set): rails and gutters write it along their length, followed by their cut length in both units (`TS35x7.5 · 1200 mm / 47.24 in`, `formatLength()` in `units.ts`). A rail's caption sits about 20% from its top edge (its right edge when vertical) so the dashed centre line doesn't strike it through. Every other part writes it **90° counterclockwise** (owner, 2026-11-18): at 0° it reads bottom to top (tilt your head left), so the long part numbers of narrow parts side by side on a rail aren't cut off when zoomed out. The caption turns with the part, so at 90° it reads left to right. Part captions are up to 13 px on screen, rails and gutters up to 11 px; on a narrow part the caption shrinks to fit (0.4 × the part's width, 0.3 on strips and rails).
- **Right:** properties of the selection: X, Y (mm), rotation, length (rails and gutters), tag, locked, and catalog info.

## Rails and gutters

- Drawn **horizontally at 0°** (the default): the length runs along x and the profile width (35 mm for DIN rail) along y. 90° makes them vertical (`footprint()` / `rotatedSize()` in `packages/shared/src/layout.ts`).
- A new one gets its catalog stock length (2000 mm). Cut it by typing the length or dragging the handle at its far end.

## Dimensions (owner request 2026-11-18)

- The toolbar switch **Dimensions** (off by default) draws X / Y dimension lines for every rail and gutter, outside the platen: X dimensions above its top edge, Y dimensions left of its left edge, from the platen's top-left corner.
- Measured to the profile's **start end and centreline** (`profileDatum()` in `layout.ts`): horizontal, X to the left end and Y to the centreline; vertical, X to the centreline and Y to the top end. Equal values share one line; each value gets its own level, nearest values closest to the platen.
- Labels in both units (`formatLength()`); Y labels read bottom to top. They're computed from the layout as drawn, so they follow a drag. Nothing is stored. "Fit" leaves a wider margin while they're shown.

## Export (owner request 2026-11-18)

- The toolbar **Export** menu has two PNG exports. Both work on released revisions (they draw from their snapshots) and always include the rail and gutter **dimensions**, whatever the toolbar switch says. Parts are drawn with warnings highlighted and nothing selected, on white.
- **Letter pages** (owner, 2026-11-18), for printing: letter at 300 dpi (2550 × 3300 px), one PNG per page (`…-platen-letter-1.png`, `-2`…).
  - Page 1: the drawing at the **largest standard scale that fits** (1:1, 1:2, 1:5, 1:10, 1:15, 1:20, 1:25, 1:50, 1:100), with its dimensions and size label, centred above the title block. Orientation is automatic: whichever of portrait / landscape allows the larger scale (portrait on a tie). The scale is printed in the title block, so the print can be measured.
  - Text is a **fixed size on paper**: one shape "px" = `PAPER_PX_MM` (0.17 mm), so part captions print 2.2 mm high, rail captions 1.9 mm and dimension labels 1.7 mm at any scale.
  - Page 2 onwards (portrait): the **grouped parts legend**: one row per part number (rails and gutters also per cut length) with the quantity (strips add up their modules; profiles "2 × 1040 mm / 40.94 in"), manufacturer, part number, description and tags. Tagged groups first. Long legends continue on further pages.
  - Every page has a title block: project, cabinet, machine, platen size, revision, scale / page number, export time (UTC).
- **Full size**: one sheet at **10 px per mm** (`Project-Machine-Rev001-Cabinet1-platen.png`) with the per-placement legend on the right and the title block underneath. Text is a fixed size on the platen: `DRAWING_PX` (0.27 mm), so part captions are 3.5 mm. Rendered off screen at 1/10 scale and enlarged by `toBlob`, so only the export allocates the full-size canvas (600 × 800 mm ≈ 7000 × 9000 px).
- Sizes live in `apps/web/src/features/layout/drawing.ts`: change `PAPER_PX_MM` (letter) or `DRAWING_PX` (full size) to scale every drawing text and line weight together. Rendering is in `PlatenExport.tsx` (one hidden Konva stage per page).

## Placing and moving

- Drag a component from the list onto the platen to create a placement.
- Move it by dragging, or by typing X and Y on the right. Both go through the same snap and validation code.
- Arrow keys nudge the selection by 1 mm; Shift + arrow nudges by 10 mm. A part on a rail only slides along it (clamped), like a typed position.
- **Selection:** click selects a part; Shift / Ctrl + click adds or removes one; Shift + drag on the background selects every part the rectangle touches; Ctrl + A selects all; Esc clears.
- **Several parts:** dragging one of them moves them all by the same distance (only the dragged part snaps). Parts on a rail that is also selected ride with the rail; parts on a rail that stays slide along it. Delete removes the selection; the panel offers Lock all / Unlock all.
- **Rows on a rail** (owner, 2026-11-18): dragging a part on a rail also moves its **chain**, the parts on the same rail touching it in an unbroken row (butted, or overlapping), as if they were selected with it. A gap or a locked part ends the row. Only the dragged part snaps; the row keeps its spacing and stops as a whole at the rail's ends (`railChain()` in `layout.ts`, `slideWithChain()` in `apps/web/src/features/layout/moves.ts`). Arrow-key nudges and typed positions move only the selection.
  - **Middle button + drag** moves only that one part (not its row, not the rest of the selection), still snapping and staying on its rail. Middle drag on the background pans.
  - **Alt + drag** is unchanged: no snapping, and the part comes off its rail. Its row stays behind (the rest of the selection still follows).
- **Copy / paste** (owner, 2026-11-18): Ctrl + C copies the selection (as it is at that moment); Ctrl + V pastes it, on the same platen only, as one undo step, and selects the pasted parts. `pasteChanges()` in `apps/web/src/features/layout/paste.ts`.
  - The group lands **centred on the mouse pointer**, or 10 mm right and down from the originals when the pointer isn't over the platen. One rail-mounted part snaps like a drop (onto a rail under it) and the rest keep their places around it; other rail-mounted parts land on a rail under them if there is one. With no rail under it, the shift goes to the grid (grid snap on).
  - A copied rail is pasted with the copied parts on it, riding the new rail.
  - **Tags** get the next free number with the same prefix (-K1 → -K7 when -K6 is the highest); parts without a tag stay without. Pasted parts are unlocked; count, colour, group label, bridges and lengths are kept.
- **Locked** placements can't be dragged, nudged or edited numerically until they're unlocked. They're still selectable, and a multi-select move or delete leaves them alone.

## Snapping

No tolerance setting (owner, 2026-11-17): snapping is about parts on a rail sitting **side by side**. "Near" is a fixed 8 screen pixels. Alt while dragging turns all snapping off (and takes a part off its rail). The code is `snapMove()` in `packages/shared/src/snap.ts`; the rail geometry and `withPatch()` are in `layout.ts`, shared by the editor and the API.

1. **Rail snap**, for `rail_mount` components whose centre is over a RAIL placement (within half the part's own size across the rail):
   - **The part follows the rail's orientation** (owner, 2026-11-17): 0° on a horizontal rail, 90° on a vertical one. Its width always runs along the rail.
   - Horizontal rail: the part's top edge goes to `rail.y − rail_edge_offset`, so the rail's top edge lands where the datasheet says. Vertical rail (part turned 90° clockwise, top edge facing right): the part's right edge is `rail_edge_offset` right of the rail's right edge.
   - No `rail_edge_offset` in the catalog: the part is centred on the rail.
   - It slides along the rail (on the grid when grid snap is on), clamped to the rail's length.
   - `rail_id` is set; dragging it clearly away clears it. "Take off" in the properties panel clears it without moving the part.
   - **Snappable** parts on the same rail butt up against each other with no gap (owner, 2026-11-18: renamed from "stackable", on by default for every part). A part only butts up against other snappable parts; turn it off in the catalog for a part that must keep a gap.
   - Dropping a part from the list onto a rail snaps it the same way. Typed X / Y on a part on a rail keeps it on the rail (clamped).
2. **The rail carries its parts**: moving, turning or resizing a rail moves the parts on it, keeping their distance along it. Locked parts come along too (they're locked to the rail). A part on a rail can't be turned on its own. Deleting the rail leaves its parts where they are, off the rail.
3. **Alignment:** other drags line up left / centre / right and top / centre / bottom with nearby parts and the platen edges, with a pink guide line.
4. **Grid snap**: 5 mm, switched on or off in the toolbar. It applies only on an axis where nothing above snapped. Typed values are never rounded to the grid.

A part on a rail that hangs past the rail's end (after shortening the rail) gets a warning.

## Terminal strips and expandable parts (owner requests 2026-11-17, 2026-11-18)

- A placed TERMINAL_BLOCK or GROUND_TERMINAL is a **strip**: `count` identical terminals side by side along the rail (1–200), one placement. Its length along the rail is count × the catalog width (the pitch, e.g. 5.1 mm for a WDU 2.5). It snaps, butts up against its neighbours, turns with its rail and warns past the rail's end like any rail part. Changing the count keeps the strip's start end where it is.
- A part marked **expandable** in the catalog (STANDARD, SAFETY, FUSE) is placed the same way: a **row** of `count` identical modules (e.g. I/O expansions), growing to the right (down on a vertical rail), with the same dividers and "N pcs" caption. It has no colour, group label or bridges. `isStrip(part)` decides; the API refuses a count above 1 on anything else.
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
- **Wire space** (owner, 2026-11-18): every terminal strip (TERMINAL_BLOCK and GROUND_TERMINAL) keeps **40 mm** free above and below it for wires, ferrules and wire labels (`WIRE_SPACE`, `wireZones()` in `layout.ts`); on a vertical rail that's right and left of it. The zones aren't stored or part of the part's box (snapping ignores them); they're drawn dashed. Any other part's body inside a zone is a clash, flagged on both (`wireSpace` in the warnings): a duct closer than 40 mm, a part on the next rail, a taller part beside the strip. Zones overlapping each other don't count, nor the strip's own rail or other terminals on the same rail.
- A rail or gutter longer than its catalog stock length (2000 mm by default) is flagged.
- A placement outside the platen is highlighted.
- A component deeper than the cabinet depth minus the platen offset is flagged once a platen offset field exists.

## Saving

- Changes save on drop or on input blur, using optimistic updates. A failure rolls the change back and shows a toast.
- Every editor write goes through `POST …/cabinets/:id/layout/changes`: a list of create / update / delete changes applied in order in **one transaction** (all or nothing). It returns the whole layout. A create carries a negative `tempId` that later changes in the same batch can use as an id or `railId`.
- **Undo / redo** (Ctrl + Z, Ctrl + Y or Ctrl + Shift + Z, and toolbar buttons) work inside the editor session, up to 100 steps. Each step keeps the layout before and after it; undo / redo send the batch that turns the current layout into that state (`changesTo()` in `apps/web/src/features/layout/history.ts`). Re-created parts get new ids, and every step is renamed to them. Held-down arrow nudges of the same selection merge into one step. Leaving the page forgets the history.

## Open

- **Stacking (owner, 2026-11-18):** parts mounted on top of each other as a tower (stand-offs between boards). Not modelled yet. The name "stackable" is kept for it; side by side on a rail is "snappable".
