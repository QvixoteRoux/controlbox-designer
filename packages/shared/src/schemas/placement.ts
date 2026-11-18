import { z } from "zod";
import { Id, NonNegativeUnits, PositiveUnits, Units } from "./common.js";
import { CabinetParams, Platen, RevisionContext } from "./cabinet.js";
import { ComponentKind } from "./enums.js";

// Placements: catalog parts laid out on a cabinet's platen (guidelines/platen-editor.md).
// x / y: top-left corner of the rotated bounding box, from the platen's top-left, +y down
// (guidelines/units-and-coordinates.md).

export const PlacementParams = CabinetParams.extend({
  placementId: z.coerce.number().int().positive(),
});

/**
 * 0° or 90° clockwise. Parts are drawn as outlines, so 180° and 270° would look the same as
 * 0° and 90° (owner decision).
 */
export const Rotation = z.union([z.literal(0), z.literal(90)]);
export type Rotation = z.infer<typeof Rotation>;
export const ROTATIONS = [0, 90] as const satisfies Rotation[];

const Tag = z
  .string()
  .trim()
  .max(30)
  .nullable()
  .transform((s) => (s === "" ? null : s));

/**
 * The catalog data a placement is drawn from: the live catalog in a WORKING revision, the
 * release snapshot in a RELEASED one.
 */
export const PlacedPart = z.object({
  componentId: Id,
  kind: ComponentKind,
  manufacturer: z.string(),
  partNumber: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  height: NonNegativeUnits,
  width: PositiveUnits,
  depth: NonNegativeUnits,
  railMount: z.boolean(),
  railEdgeOffset: NonNegativeUnits.nullable(),
  stackable: z.boolean(),
  attributes: z.record(z.string(), z.json()),
  /** false when the catalog row was deactivated after it was placed. */
  active: z.boolean(),
});
export type PlacedPart = z.infer<typeof PlacedPart>;

export const Placement = z.object({
  id: Id,
  x: Units,
  y: Units,
  rotation: Rotation,
  /** Rails and gutters only: the cut length. */
  length: PositiveUnits.nullable(),
  locked: z.boolean(),
  /** The rail this part is snapped to. */
  railId: Id.nullable(),
  /** Electrical tag, e.g. "-K1". */
  tag: z.string().nullable(),
  zIndex: z.number().int(),
  part: PlacedPart,
});
export type Placement = z.infer<typeof Placement>;

/** POST …/cabinets/:cabinetId/placements. A rail or gutter without a length gets its stock length. */
export const CreatePlacementInput = z.object({
  componentId: Id,
  x: Units,
  y: Units,
  rotation: Rotation.default(0),
  length: PositiveUnits.nullable().default(null),
  tag: Tag.default(null),
});
export type CreatePlacementInput = z.infer<typeof CreatePlacementInput>;

/** PATCH …/placements/:placementId. A locked placement only accepts `locked`. */
export const UpdatePlacementInput = z
  .strictObject({
    x: Units,
    y: Units,
    rotation: Rotation,
    length: PositiveUnits,
    locked: z.boolean(),
    tag: Tag,
    zIndex: z.number().int(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type UpdatePlacementInput = z.infer<typeof UpdatePlacementInput>;

/** GET …/cabinets/:cabinetId/layout: everything the platen editor draws. */
export const LayoutDetail = z.object({
  context: RevisionContext,
  cabinet: z.object({
    id: Id,
    number: z.number().int(),
    depth: PositiveUnits,
    hasPlaten: z.boolean(),
  }),
  platen: Platen.nullable(),
  /** Back to front (z-order). */
  placements: z.array(Placement),
});
export type LayoutDetail = z.infer<typeof LayoutDetail>;
