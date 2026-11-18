import { z } from "zod";
import { Id, NonNegativeUnits, PositiveUnits, Units } from "./common.js";
import { CabinetParams, Platen, RevisionContext } from "./cabinet.js";
import { MAX_TERMINAL_LEVELS } from "./component.js";
import { ComponentKind, TerminalColor } from "./enums.js";

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

/** Terminal strips: up to 200 terminals side by side in one placement. */
export const MAX_STRIP_COUNT = 200;
export const DEFAULT_TERMINAL_COLOR: TerminalColor = "LIGHT_GREY";

/** Kinds placed as strips (a count of identical terminals along the rail). */
export const isStrip = (kind: ComponentKind) =>
  kind === "TERMINAL_BLOCK" || kind === "GROUND_TERMINAL";
/** Only terminal blocks have a colour, group label and bridged levels (ground terminals don't). */
export const hasStripOptions = (kind: ComponentKind) => kind === "TERMINAL_BLOCK";

const Count = z.number().int().min(1).max(MAX_STRIP_COUNT);
/** Bridged levels, as a sorted set: [1], [1, 2]… */
const BridgedLevels = z
  .array(z.number().int().min(1).max(MAX_TERMINAL_LEVELS))
  .transform((levels) => [...new Set(levels)].sort((a, b) => a - b));
const GroupLabel = z
  .string()
  .trim()
  .max(30)
  .nullable()
  .transform((s) => (s === "" ? null : s));

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
  /** Terminal strips: terminals side by side along the rail. 1 for everything else. */
  count: Count,
  /** TERMINAL_BLOCK only (light grey unless chosen); null for other kinds. */
  color: TerminalColor.nullable(),
  /** TERMINAL_BLOCK only. */
  groupLabel: z.string().nullable(),
  /** TERMINAL_BLOCK only: levels bridged across the whole strip. */
  bridgedLevels: z.array(z.number().int()),
  part: PlacedPart,
});
export type Placement = z.infer<typeof Placement>;

/**
 * POST …/cabinets/:cabinetId/placements. A rail or gutter without a length gets its stock length.
 * `railId`: the rail placement it's dropped onto (rail-mounted parts, same rotation as the rail).
 */
export const CreatePlacementInput = z.object({
  componentId: Id,
  x: Units,
  y: Units,
  rotation: Rotation.default(0),
  length: PositiveUnits.nullable().default(null),
  railId: Id.nullable().default(null),
  tag: Tag.default(null),
  count: Count.default(1),
  /** null: light grey for terminal blocks. */
  color: TerminalColor.nullable().default(null),
  groupLabel: GroupLabel.default(null),
  bridgedLevels: BridgedLevels.default([]),
});
export type CreatePlacementInput = z.infer<typeof CreatePlacementInput>;

/**
 * PATCH …/placements/:placementId. A locked placement only accepts `locked`.
 * Moving or turning a rail carries the parts on it (`withPatch` in layout.ts).
 */
const patchFields = {
  x: Units,
  y: Units,
  rotation: Rotation,
  length: PositiveUnits,
  /** Snap onto a rail (rail-mounted parts, same rotation as the rail), or null to leave it. */
  railId: Id.nullable(),
  locked: z.boolean(),
  tag: Tag,
  zIndex: z.number().int(),
  count: Count,
  color: TerminalColor,
  groupLabel: GroupLabel,
  bridgedLevels: BridgedLevels,
};
export const UpdatePlacementInput = z
  .strictObject(patchFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type UpdatePlacementInput = z.infer<typeof UpdatePlacementInput>;

// ── Batches (multi-select, undo / redo) ──

/** A placement id, or the negative temporary id of a placement created earlier in the batch. */
const Ref = z
  .number()
  .int()
  .refine((n) => n !== 0, "Not an id");
export const TempId = z.number().int().negative();

const CreateChange = CreatePlacementInput.extend({
  op: z.literal("create"),
  tempId: TempId,
  railId: Ref.nullable().default(null),
  locked: z.boolean().default(false),
  /** Given by undo, to put a part back at its old place in the z-order. */
  zIndex: z.number().int().optional(),
});
const UpdateChange = z.object({
  op: z.literal("update"),
  id: Ref,
  patch: z
    .strictObject({ ...patchFields, railId: Ref.nullable() })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nothing to update"),
});
const DeleteChange = z.object({ op: z.literal("delete"), id: Ref });

export const LayoutChange = z.discriminatedUnion("op", [CreateChange, UpdateChange, DeleteChange]);
export type LayoutChange = z.input<typeof LayoutChange>;

/** POST …/cabinets/:cabinetId/layout/changes: applied in order, all or nothing. */
export const LayoutChanges = z.object({ changes: z.array(LayoutChange).min(1).max(1000) });
export type LayoutChanges = z.infer<typeof LayoutChanges>;

export const LayoutChangesResult = z.object({
  /** Every placement on the platen afterwards, back to front. */
  placements: z.array(Placement),
  /** The real ids given to the batch's creates. */
  created: z.array(z.object({ tempId: TempId, id: Id })),
});
export type LayoutChangesResult = z.infer<typeof LayoutChangesResult>;

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
