# Changelog

What changed, newest first. The rules behind each change are in [guidelines/](guidelines/README.md); the commit hashes point to the full change.

## 2026-11-20

### Upgrading

One new migration: `bottom_plate`. It also replaces the database check `cabinet_openings_shape`. After pulling:

```
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter @cabinet-planner/shared build
```

### Cabinets

- **Bottom plate:** the opening under a metal cabinet's removable, screwed-on bottom lid.
  - A "Bottom plate" switch on the cabinet page adds one centred on BOTTOM, at 70% of its width and depth, with 10 mm rounded corners.
  - Edit it like any opening. Its face is always BOTTOM, and its corner radius can be anything from 0 (square) to half its shorter side.
  - Holes can go on the plate or beside it. A hole crossing the plate's edge gets an "Overlaps" warning.
  - It's drawn dashed, under the holes.

## 2026-11-19

### Upgrading

One new migration: `cabinet_doors`. After pulling:

```
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter @cabinet-planner/shared build
```

### Cabinets

- **1 or 2 doors** (`19f5fd8`): a cabinet can have two doors.
  - The two doors are vertical: the left one is hinged on the left, the right one on the right.
  - A 2-door cabinet can't be mounted turned.
  - "Window: yes" adds one window per door.
  - The FRONT view shows both hinges and a dashed line where the doors meet. An opening on FRONT that crosses that line gets a warning.
  - The cabinet page shows the door count.
- **Side labels** (`f4f33d4`): every face view names the face past each edge, so a side view shows where the other sides are. Faces are seen from outside, so BACK and BOTTOM show LEFT and RIGHT swapped.

### Platen editor and export

- **Side labels** (`f4f33d4`): TOP, BOTTOM, LEFT and RIGHT around the platen, on screen and on both exports. They sit outside the dimension lines.

## 2026-11-18

### Upgrading

Five new migrations: `rename_stackable_to_snappable`, `safety_kind`, `expandable_parts`, `component_type_fill_color`, `relay_kind`. After pulling:

```
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter @cabinet-planner/shared build
```

The tests load `packages/shared` from its built `dist/`, so rebuild it after changing the shared package.

Some migrations also update the snapshots of released revisions:

- the `stackable` field is renamed to `snappable`;
- `expandable` and `fillColor` are added.

Released drawings keep showing what was released. Afterwards, open a released revision to check it still draws from its snapshot.

### Catalog

- **Snappable** (`28e7452`): the flag was called "stackable" and is now on by default for every part. Behaviour is unchanged: parts on the same rail butt up with no gap. "Stackable" is kept for parts mounted on top of each other, which isn't modelled yet.
- **Safety kind** (`51396a4`): it has the same fields as Standard, is listed right after it and is drawn in yellow. It can also be mounted in a round hole on a cabinet face.
- **Expandable parts** (`ae283f7`): Standard, Safety and Fuse parts can be marked expandable. They're then placed as a row of identical modules (a count of 1–200), growing to the right like a terminal strip. Expandable can't be switched off while a working revision has the part placed as a row.
- **Type fill colour** (`66368a8`): component types can set a fill colour for their parts. The kind still sets the outline. Captions switch to dark or white text so they stay readable.
- **Relay kind** (`f4f394e`): "Base mount" is on by default.
  - The relay entry also holds the base (socket): its manufacturer, part number and size, plus the mounted depth of the pair.
  - The rail offset is measured from the base.
  - On the platen, base and relay are one box: their combined outline, with the relay centred on the base.
  - Parts lists add the base as its own row.

### Platen editor

- **Captions** (`ea65ea1`, `2e2638f`):
  - Part numbers read bottom to top, so they aren't cut off on narrow parts when zoomed out.
  - Rails and ducts add their cut length (`1200 mm / 47.24 in`).
  - Rail captions sit clear of the dashed centre line.
- **Rows on a rail** (`1685def`): dragging a part brings the parts touching it in an unbroken row on that rail. The row stops as a whole at the rail's ends. Middle-button drag moves one part on its own, and Alt + drag is unchanged.
- **Part list** (`66368a8`): collapsible groups by kind, then type. A search opens every group with a match.
- **Dimensions** (`1090ed5`): a toolbar switch draws X/Y dimension lines for rails and ducts, measured from the platen's top-left corner to each one's start end and centreline. Labels show mm and inches.
- **Copy / paste** (`166b7de`): Ctrl+C / Ctrl+V, on the same platen.
  - Pasted parts land centred on the mouse pointer and snap onto a rail under it.
  - A copied rail brings its copied parts with it.
  - Tags get the next free number.
- **Wire space** (`b267f5b`): terminal strips (terminal blocks and ground terminals) keep 40 mm free above and below them, drawn dashed. Any other part inside that space is flagged on both parts.

### Export

- **Full size PNG** (`5548686`): one sheet at 10 px/mm with the platen, dimensions, a parts legend and a title block. Text is a fixed size on the drawing.
- **Letter pages** (`af02bd4`): printable PNGs at 300 dpi.
  - Page 1 has the drawing at the largest standard scale that fits, in automatic orientation, with the scale in the title block.
  - Text is a fixed size on paper.
  - Page 2 onwards lists the parts, grouped.
