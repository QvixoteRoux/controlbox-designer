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
- A **round hole** can hold a catalog component (pushbutton, pilot light…): `component_id`, kinds STANDARD or FUSE only (`canMountInHole()`). A new choice must be active; the hole keeps a part deactivated later. Changing the hole to another kind clears it.

## Catalog (`components`)

One table for every catalog item. The common columns are manufacturer, part number, code, type, input voltage, phases, height/width/depth, rail mount, rail edge offset, stackable and image.

`kind` decides which fields the form and API take, and what `attributes` (JSON) holds. Each kind has its own input schema in `packages/shared/src/schemas/component.ts`; `componentColumns()` fills in the columns a kind doesn't use.

| kind            | input                                                  | attributes                          | notes                                                                                                                     |
| --------------- | ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| STANDARD        | W × H × D, voltage, phases, rail mount + offset, stack | `{}`                                | Most devices. Sizes can be typed in inches (rounded to whole mm).                                                         |
| FUSE            | same as STANDARD                                       | `{ amperage, poles }`               | Fuse holder and fuse are one item. Inches allowed.                                                                        |
| TERMINAL_BLOCK  | W × H × D, rail offset (required), stackable           | `{ levels: 1–4 }`                   | Always rail mounted, stackable by default. Width is along the rail. 4 levels is rare.                                     |
| GROUND_TERMINAL | same as TERMINAL_BLOCK                                 | `{}`                                | Green/yellow PE terminal, **always 1 level**, no colour choice.                                                           |
| GUTTER          | width, height (optional, 0 = not given)                | `{ stockLength }` (default 2000 mm) | Stored as width = duct width, depth = duct height, height = 0. The width is what matters on the platen; height is for 3D. |
| RAIL            | type, code, description only                           | `{ stockLength: 2000 mm }`          | **Built in, exactly one** (see below). TS35 × 7.5: width = 350, depth = 75, height = 0. Mounting holes are ignored.       |

**The DIN rail is built in.** It's a standard size across manufacturers, so the catalog holds exactly one rail: Generic TS35x7.5 (35 × 7.5 mm, 2000 mm stock; `BUILT_IN_RAIL` in `packages/shared`). Migration `builtin_din_rail` adds it to every database. The API refuses to add another rail, turn a part into a rail or the rail into something else, and refuses to delete it. It is always active, and its sizes can't change. The DB backs this up with the unique index `components_one_rail` and the check `components_builtin_rail`. Only its type, code, description and picture can be edited.

Rails and gutters are cut to fit: the length is set on each placement. A placed length over the stock length gets a warning in the editor, not a block.

Field meanings:

- `phases`: 1 or 3, for AC only. `NULL` for DC.
- `rail_edge_offset`: the distance from the component's top edge to the rail's top edge, used for rail snapping.
- `code`: the internal "ID" from the spec. Optional, and unique when set. Manufacturer + part number is unique too; both give a clear 409.
- Rows that are in use (on a platen or in a hole) are **never hard-deleted**. Set `active = false` and the editor hides them from the add list.
- A component's **kind can't change** once it's in use.
- One picture per component (see "Images" in `guidelines/stack.md`).

## Cabinet and component types

Two lookup lists managed on the **Types** page (`/api/types/cabinet-types`, `/api/types/component-types`), `components` permission.

- Name unique, sort order (new ones go last), `active`.
- A type in use can't be deleted (409): deactivate it. Inactive types are hidden from new choices; rows that already have one keep it.

## Cable glands (`cable_glands`)

Only `size` (text, e.g. "M20", unique) and `hole_diameter`, plus an optional picture.

- Managed on the **Cable glands** page; editing needs the `components` permission.
- A gland used by any opening can't be deleted (409); deactivate it instead, which hides it from new openings.

## Placements

Each placement stores x, y, rotation, an optional length (gutter and rail only), `locked`, an optional `rail_id` (the rail it's snapped to), a tag (-K1…), z-order, and a `snapshot` that is filled on release.

- API: `GET …/cabinets/:id/layout` (platen + placements, drawn from the snapshot once released), `POST …/placements`, `PATCH …/placements/:id`, `DELETE …/placements/:id`. Writes need `projects` and a WORKING revision, and the cabinet's platen switched on.
- A new placement goes on top (highest z-order). A rail or gutter without a length gets its stock length; other kinds can't have a length.
- A **locked** placement only accepts unlocking (409 otherwise, delete included).

**Planned with the platen editor** (owner request, 2026-11-17; columns added then): terminal strips. See `guidelines/platen-editor.md`.

## Confirmed decisions

- [x] A project has several machines; each machine has its own drawing, and `quantity` covers identical copies.
- [x] The default platen is 50 mm smaller in **both** height and width.
- [x] Rail edge offset is measured from the component's top edge to the rail's **top edge**, not its centre line.
- [x] Revisions are numeric, starting at 1: 1…999, shown zero-padded to 3 digits ("Rev 001", "Rev 007").
- [x] Fuse attributes describe the fuse holder and fuse as one catalog item.
