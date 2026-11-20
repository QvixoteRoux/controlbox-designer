# Units & coordinates

## Length unit

All lengths and positions are **integers in 0.1 mm** in the DB, the API and the shared types.

| Real                    | Stored |
| ----------------------- | ------ |
| 600 mm                  | 6000   |
| 5.2 mm (terminal width) | 52     |
| 35 mm (DIN rail)        | 350    |

- The UI shows and accepts millimetres with up to 1 decimal place.
- Convert only with `packages/shared/src/units.ts`:
  ```ts
  export const toUnits = (mm: number) => Math.round(mm * 10);
  export const toMm = (u: number) => u / 10;
  ```
- Why integers: snapping and equality checks must be exact, and floats drift.
- **Inches**: the catalog form for standard parts and fuses also takes sizes in inches. They're rounded to the **nearest whole millimetre** on save (`inchesToUnits()` in `units.ts`: 2.5 in = 63.5 mm → 64 mm), and stored like any other size. Nothing remembers that a size was typed in inches.

## Platen coordinates

- Origin: the **platen's top-left corner**, as seen from the front with the cabinet upright.
- +x points right and +y points down. This matches the canvas, so no conversion is needed.
- `placement.x / y` is the **top-left corner of the component's bounding box after rotation**.
- Rotation is 0° or 90° clockwise. 90° swaps width and height for the bounding box. There is no 180° or 270°: parts are drawn as outlines, so they would look the same as 0° and 90°.
- Editor scale: at zoom 1, 1 canvas px = 1 mm (that is, 10 units).

## Cabinet faces

- Faces are named in the cabinet's own frame, as manufactured: `FRONT` (the door), `BACK`, `LEFT`, `RIGHT`, `TOP`, `BOTTOM`. LEFT and RIGHT are as seen from the front.
- Each face has its own 2D system with the **origin at the face's top-left corner**. You view the face **from outside the cabinet**, with +x right and +y down (the same directions as the platen).
- For TOP and BOTTOM, view from outside with FRONT toward you (at the bottom of the view).
- Every face view names the face past each edge (`faceNeighbours()` in `faces.ts`). Faces are viewed from outside, so BACK and BOTTOM show LEFT and RIGHT swapped. The platen is viewed from the front and uses FRONT's neighbours.
- `opening.x / y` is:
  - the **centre** for round holes and cable glands
  - the **top-left corner** for windows, rectangular holes and bottom plates
- A position inside the face is always ≥ 0. Negative values (or past the far edge) are allowed and shown as "outside the face" warnings.
- Because positions are measured from the top-left corner, resizing a cabinet keeps every opening at the same distance from that corner. Openings near the right or bottom edge may then end up off the face (and get flagged).
- Changed on 2026-11-17 from "centre origin, +y up". Migration `opening_origin_top_left` converted the stored positions.
- Face size:
  - FRONT and BACK: width × height
  - LEFT and RIGHT: depth × height
  - TOP and BOTTOM: width × depth

## Orientation

- `hinge_side`: the door hinge side in the cabinet's own frame. `BOTH` is for 2-door cabinets (left door hinged left, right door hinged right); see "Doors" in `data-model.md`.
- 2-door cabinets are always mounted as manufactured (`up_face = TOP`).
- `up_face`: which face points up once mounted. `TOP` means mounted as manufactured.
- Face names never change when the cabinet is rotated. Only the drawing rotates. This keeps hole positions valid whichever way the cabinet ends up mounted.

## Defaults

- New platen: height = cabinet height − 500 and width = cabinet width − 500 (that is, 50 mm less in each), editable afterwards.
