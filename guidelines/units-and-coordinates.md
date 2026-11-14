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

## Platen coordinates

- Origin: the **platen's top-left corner**, as seen from the front with the cabinet upright.
- +x points right and +y points down. This matches the canvas, so no conversion is needed.
- `placement.x / y` is the **top-left corner of the component's bounding box after rotation**.
- Rotation is 0 / 90 / 180 / 270 clockwise. A 90° or 270° rotation swaps width and height for the bounding box.
- Editor scale: at zoom 1, 1 canvas px = 1 mm (that is, 10 units).

## Cabinet faces

- Faces are named in the cabinet's own frame, as manufactured: `FRONT` (the door), `BACK`, `LEFT`, `RIGHT`, `TOP`, `BOTTOM`. LEFT and RIGHT are as seen from the front.
- Each face has its own 2D system with the **origin at the face centre**. You view the face **from outside the cabinet**, with +x right and +y up.
- For TOP and BOTTOM, view from outside with FRONT toward you (at the bottom of the view).
- `opening.x / y` is the **centre** of the window, hole or gland.
- Face size:
  - FRONT and BACK: width × height
  - LEFT and RIGHT: depth × height
  - TOP and BOTTOM: width × depth

## Orientation

- `hinge_side`: the door hinge side in the cabinet's own frame.
- `up_face`: which face points up once mounted. `TOP` means mounted as manufactured.
- Face names never change when the cabinet is rotated. Only the drawing rotates. This keeps hole positions valid whichever way the cabinet ends up mounted.

## Defaults

- New platen: height = cabinet height − 500 and width = cabinet width − 500 (that is, 50 mm less in each), editable afterwards.
