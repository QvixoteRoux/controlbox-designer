# Owner decisions

Decisions that shape the product, grouped by area. The rules they led to are in `guidelines/`; this file says what was decided and when.

## Working style

- Plan first and wait for an OK; one feature at a time, pausing after each part (from the start).
- Commit and push only when asked (from the start).
- Changes to `guidelines/` or the database schema are proposed and agreed first; an approved plan covers what it lists (from the start).

## Accounts

- Login is exact-case; usernames are unique ignoring case (2026-11-17).

## Cabinet faces

- Origin at the top-left corner of each face, viewed from outside; +x right, +y down (2026-11-17).
- Round holes and glands are placed by their centre; windows and rectangular holes by their top-left corner. Stored that way in the database (2026-11-17).
- Gland arrays: x/y is the centre of the first (top-left) hole; the array grows right and down (2026-11-17).

## Catalog

- No image size limits (a 20 MB technical cap remains); PNG, JPEG, WebP (2026-11-17).
- Standard parts and fuses may be typed in inches, rounded to the nearest whole mm (2026-11-17).
- DIN rail: 35 mm wide, 2000 mm stock, cut to fit; mounting holes ignored (2026-11-17).
- **The DIN rail is built in**: one fixed TS35 × 7.5 rail, no new rail components, since the size is standard across manufacturers (2026-11-17). A 15 mm rail could be a second built-in later.
- Wire ducts (gutters): the width matters on the platen; height only for 3D; 2000 mm stock, cut to fit (2026-11-17).
- Terminal blocks: 1–4 levels (4 is rare). Ground terminals: always 1 level, half green / half yellow (2026-11-17).
- `stackable` renamed to **snappable** (butts up side by side on a rail), on by default. "Stackable" is kept for parts mounted on top of each other as a tower (2026-11-18).
- New kind **Safety**, listed right after Standard, drawn in yellow, can mount in round holes (2026-11-18).
- **Expandable** parts (Standard, Safety, Fuse) can be placed as a row of identical modules, like terminal strips (2026-11-18).
- Component types get an optional fill colour: **outline by kind, fill by type** (2026-11-18).
- New kind **Relay**: the base (socket) is typed in the same catalog entry, with its own part number and size, plus the mounted depth (2026-11-18).

## Platen editor

- Parts are drawn as coloured outlines, not pictures (2026-11-17).
- Rails are horizontal by default and can be vertical (2026-11-17).
- **Rotation is 0° or 90° only**: 180° and 270° look the same as outlines (2026-11-17).
- No snap-tolerance setting: snapping means parts on a rail sit side by side (2026-11-17).
- Parts snapped to a vertical rail **follow the rail's orientation** (2026-11-17).
- Terminal strips: a 1-D array along the rail, optional group label, bridged levels, colour (light grey default, dark grey, beige, red, green, blue, yellow). Ground terminal strips: count only (2026-11-17).
- Terminal numbering: the group label only, for now (2026-11-17).
- Strips show the count on a second caption line, under a divider, and a line between each terminal (2026-11-17).
- Part captions are rotated 90° counterclockwise, except on rails and gutters (2026-11-18).
- Dragging a part on a rail moves the unbroken row it's in; middle-drag moves only that part (2026-11-18).
- Rail and gutter captions show the cut length in mm and inches (2026-11-18).
- Dimensions (toolbar toggle, off by default) measure from the platen's top-left origin to each rail's or gutter's start end and centreline, in mm and inches (2026-11-18).
- 40 mm of wire space is kept free above and below terminal strips; this applies to both terminal kinds (assumption, told to the owner, 2026-11-18).

## Repository

- Public on GitHub (2026-11-17).
- License: **AGPL-3.0-or-later**, copyright Qvixote Roux (2026-11-18).
- Progress, open items, plans and bugs are tracked in `projectnotes/` (2026-11-18).
