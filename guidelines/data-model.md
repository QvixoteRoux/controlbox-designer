# Data model

Source of truth: `apps/api/prisma/schema.prisma` + `apps/api/prisma/sql/constraints.sql`.
This file explains the _why_ and the parts stored as JSON.

## Overview

```
Project 1─* Machine 1─* MachineRevision 1─* Cabinet 1─0..1 Platen 1─* Placement *─1 Component
                                             Cabinet 1─* CabinetOpening ─0..1 CableGland
                                                                        ─0..1 Component (mounted in hole)
CabinetType 1─* Cabinet          ComponentType 1─* Component
User 1─* Session
```

## Projects and machines

- A **project** is identified by its `name` (free text, unique).
- `customer`: plain text, not a lookup table. The UI can suggest existing values, but there's nothing to manage.
- A project has one or more **machines**. Each machine is its own design with its own drawing and revision history.
  - `name`: free text, unique within the project.
  - `quantity`: how many identical copies of this machine get built (≥ 1).
- `extra` (JSON) on both: fields added later. Promote a field to a real column once it's used for filtering or sorting.

## Cabinets

- `number` is unique within a revision.
- `type` comes from the `cabinet_types` lookup table. Seed it with Control, Power, Jumper, Safety, Motion, Comms and General; admins can add more later.
- `number` defaults to the next free number in the revision when left out.
- Height and width must be more than 50 mm, so the default platen fits.
- **Window yes/no is derived**: a cabinet has a window when it has an opening of kind `WINDOW`. The Yes/No switch (`PUT …/window`):
  - Yes: if there's no window, adds one centred on FRONT at half the door's width and height (`defaultWindow()` in `packages/shared/src/faces.ts`). No form; edit it in the openings list.
  - No: removes **every** window on the cabinet. Holes and glands stay.
- Every cabinet gets a platen row on creation (default size). `has_platen` off keeps the row, so switching it back on restores the size and layout.
- `other_voltages`: a list of strings, which can be empty.

## Openings (`cabinet_openings`)

| kind        | uses                                                    |
| ----------- | ------------------------------------------------------- |
| WINDOW      | face, x, y, width, height                               |
| RECT_HOLE   | face, x, y, width, height                               |
| ROUND_HOLE  | face, x, y, diameter, optional component                |
| CABLE_GLAND | face, x, y, gland (the diameter comes from the catalog) |

A database check rule enforces the right fields for each kind.

- Openings that stick out past their face, or overlap another opening on the same face, are **saved anyway** and shown in red as warnings (`openingWarnings()` in `packages/shared/src/faces.ts`). Face sizes follow `guidelines/units-and-coordinates.md`.
- A gland opening needs an active gland when it's created or switched to another gland; it keeps its gland if that gland is deactivated later.
- **Gland arrays** (`POST …/openings/gland-array`, cable glands only): columns × rows of one gland. x / y is the **centre of the first (top-left) hole**; the grid grows to the right and down (+x, +y), spaced **centre to centre** by `pitchX` / `pitchY` (`gridPositions()` in `faces.ts`). At most 200 holes.
  - Saved as separate CABLE_GLAND openings (no array record), all in one transaction; edited and deleted one by one afterwards.
  - A label becomes a numbered prefix ("PG" → PG1, PG2…), row by row from the first hole. With one hole the label is kept as is.
  - The form warns before saving when the pitch is smaller than the hole diameter (neighbours overlap) or holes stick out past the face (`gridWarnings()`). Saving is still allowed.
- Not built yet: picking a catalog component to mount in a round hole (comes with the component catalog).

## Catalog (`components`)

One table for every catalog item. The common columns are manufacturer, part number, code, type, input voltage, phases, height/width/depth, rail mount, rail edge offset, stackable and image.

`kind` decides what `attributes` (JSON) holds. Each kind has its own Zod schema in `packages/shared/src/schemas/component.ts`:

| kind           | attributes                            | notes                                                                                                          |
| -------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| STANDARD       | `{}`                                  | Most devices                                                                                                   |
| FUSE           | `{ amperage: number, poles: number }` |                                                                                                                |
| TERMINAL_BLOCK | `{ levels: number }`                  | Width, height and depth use the common columns                                                                 |
| GUTTER         | `{}`                                  | Sized per placement: width = duct width, depth = duct height, height = 0. The length is set on each placement. |
| RAIL           | `{ profile?: string }`                | Same pattern: width = 350 for 35 mm DIN rail, depth = rail height, length set per placement                    |

Field meanings:

- `phases`: 1 or 3, for AC only. `NULL` for DC.
- `rail_edge_offset`: the distance from the component's top edge to the rail's top edge, used for rail snapping.
- `code`: the internal "ID" from the spec. Optional, and unique when set.
- Rows that are in use are **never hard-deleted**. Set `active = false` and the editor hides them from the add list.

## Cable glands (`cable_glands`)

Only `size` (text, e.g. "M20", unique) and `hole_diameter`, plus an optional image (images come with the catalog feature).

- Managed on the **Cable glands** page; editing needs the `components` permission.
- A gland used by any opening can't be deleted (409); deactivate it instead, which hides it from new openings.

## Placements

Each placement stores x, y, rotation, an optional length (gutter and rail only), `locked`, an optional `rail_id` (the rail it's snapped to), a tag (-K1…), z-order, and a `snapshot` that is filled on release.

## Confirmed decisions

- [x] A project has several machines; each machine has its own drawing, and `quantity` covers identical copies.
- [x] The default platen is 50 mm smaller in **both** height and width.
- [x] Rail edge offset is measured from the component's top edge to the rail's **top edge**, not its centre line.
- [x] Revisions are numeric, starting at 1: 1…999, shown zero-padded to 3 digits ("Rev 001", "Rev 007").
- [x] Fuse attributes describe the fuse holder and fuse as one catalog item.
