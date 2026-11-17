import { z } from "zod";
import { Extra, Id, PositiveUnits, Units } from "./common.js";
import { CabinetMaterial, Face, HingeSide, OpeningKind } from "./enums.js";
import { GlandRef } from "./gland.js";
import { MachineRevision, RevisionParams, RevisionSummary } from "./project.js";

export const CabinetParams = RevisionParams.extend({
  cabinetId: z.coerce.number().int().positive(),
});
export const OpeningParams = CabinetParams.extend({
  openingId: z.coerce.number().int().positive(),
});

/** Default platen: 50 mm (500 units) smaller than the cabinet in both height and width. */
export const PLATEN_MARGIN = 500;
export const defaultPlatenSize = (cabinet: { height: number; width: number }) => ({
  height: cabinet.height - PLATEN_MARGIN,
  width: cabinet.width - PLATEN_MARGIN,
});

/** Cabinet height and width leave room for the default platen. */
const OuterSize = PositiveUnits.gt(PLATEN_MARGIN, "Must be more than 50 mm");
const Voltage = z.string().trim().min(1, "Required").max(50);

const cabinetFields = {
  /** 1, 2, 3… unique within the revision. */
  number: z.number().int().positive(),
  typeId: Id,
  material: CabinetMaterial,
  height: OuterSize,
  width: OuterSize,
  depth: PositiveUnits,
  hasPlaten: z.boolean(),
  mainVoltage: Voltage,
  otherVoltages: z.array(Voltage),
  hingeSide: HingeSide,
  upFace: Face,
  extra: Extra,
};

export const Cabinet = z.object({
  id: Id,
  revisionId: Id,
  ...cabinetFields,
  height: PositiveUnits,
  width: PositiveUnits,
});
export type Cabinet = z.infer<typeof Cabinet>;

/** `number` may be left out: the API takes the next free one in the revision. */
export const CreateCabinetInput = z.object({
  ...cabinetFields,
  number: cabinetFields.number.optional(),
  hasPlaten: cabinetFields.hasPlaten.default(true),
  otherVoltages: cabinetFields.otherVoltages.default([]),
  hingeSide: cabinetFields.hingeSide.default("LEFT"),
  upFace: cabinetFields.upFace.default("TOP"),
  extra: cabinetFields.extra.default({}),
});
export type CreateCabinetInput = z.infer<typeof CreateCabinetInput>;

export const UpdateCabinetInput = z
  .strictObject(cabinetFields)
  .partial()
  .refine((c) => Object.keys(c).length > 0, "Nothing to update");
export type UpdateCabinetInput = z.infer<typeof UpdateCabinetInput>;

export const CabinetType = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export type CabinetType = z.infer<typeof CabinetType>;
export const CabinetTypeList = z.array(CabinetType);

export const Platen = z.object({
  id: Id,
  cabinetId: Id,
  height: PositiveUnits,
  width: PositiveUnits,
});
export type Platen = z.infer<typeof Platen>;

export const UpdatePlatenInput = z.object({ height: PositiveUnits, width: PositiveUnits });
export type UpdatePlatenInput = z.infer<typeof UpdatePlatenInput>;

/** PUT …/cabinets/:cabinetId/window : the cabinet's "Window: yes / no" switch. */
export const SetWindowInput = z.object({ hasWindow: z.boolean() });
export type SetWindowInput = z.infer<typeof SetWindowInput>;

// ── Openings (windows, holes, cable glands on a cabinet face) ──
// x / y from the face's top-left corner, +x right, +y down, seen from outside
// (guidelines/units-and-coordinates.md): the centre of round holes and glands, the top-left
// corner of windows and rectangular holes.

const openingBase = {
  face: Face,
  x: Units,
  y: Units,
  label: z.string().trim().max(50).nullable().default(null),
};

/** POST / PUT body. `kind` decides which size fields apply (a DB check enforces it too). */
export const OpeningInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("WINDOW"),
    ...openingBase,
    width: PositiveUnits,
    height: PositiveUnits,
  }),
  z.object({
    kind: z.literal("RECT_HOLE"),
    ...openingBase,
    width: PositiveUnits,
    height: PositiveUnits,
  }),
  z.object({ kind: z.literal("ROUND_HOLE"), ...openingBase, diameter: PositiveUnits }),
  z.object({ kind: z.literal("CABLE_GLAND"), ...openingBase, glandId: Id }),
]);
export type OpeningInput = z.infer<typeof OpeningInput>;

/** Most holes one gland array may create. */
export const MAX_GLAND_ARRAY = 200;

/**
 * POST …/openings/gland-array : columns × rows gland openings of one gland. (x, y) is the first,
 * top-left hole; the grid grows right and down, spaced centre to centre by pitchX / pitchY.
 * Saved as separate openings. With a label, each opening gets it plus a number ("PG1", "PG2"…),
 * row by row from the first hole.
 */
export const GlandArrayInput = z
  .object({
    face: Face,
    x: Units,
    y: Units,
    glandId: Id,
    columns: z.number().int().min(1).max(50),
    rows: z.number().int().min(1).max(50),
    /** Centre-to-centre spacing. Only checked when there's more than one column / row. */
    pitchX: Units.nonnegative(),
    pitchY: Units.nonnegative(),
    label: z.string().trim().max(45).nullable().default(null),
  })
  .refine((a) => a.columns * a.rows <= MAX_GLAND_ARRAY, {
    message: `At most ${MAX_GLAND_ARRAY} holes per array`,
    path: ["rows"],
  })
  .refine((a) => a.columns === 1 || a.pitchX > 0, {
    message: "Needs a spacing for more than one column",
    path: ["pitchX"],
  })
  .refine((a) => a.rows === 1 || a.pitchY > 0, {
    message: "Needs a spacing for more than one row",
    path: ["pitchY"],
  });
export type GlandArrayInput = z.infer<typeof GlandArrayInput>;

export const Opening = z.object({
  id: Id,
  cabinetId: Id,
  kind: OpeningKind,
  face: Face,
  x: Units,
  y: Units,
  width: PositiveUnits.nullable(),
  height: PositiveUnits.nullable(),
  diameter: PositiveUnits.nullable(),
  glandId: Id.nullable(),
  componentId: Id.nullable(),
  label: z.string().nullable(),
  gland: GlandRef.nullable(),
});
export type Opening = z.infer<typeof Opening>;

// ── Views ──

/** Where a revision sits, for breadcrumbs and the read-only state. */
export const RevisionContext = z.object({
  project: z.object({ id: Id, name: z.string() }),
  machine: z.object({ id: Id, name: z.string() }),
  revision: MachineRevision.pick({ id: true, rev: true, status: true }),
});
export type RevisionContext = z.infer<typeof RevisionContext>;

/** A row of the revision page's cabinet table. */
export const CabinetSummary = Cabinet.pick({
  id: true,
  number: true,
  material: true,
  height: true,
  width: true,
  depth: true,
  hasPlaten: true,
  mainVoltage: true,
  otherVoltages: true,
}).extend({
  type: z.string(),
  hasWindow: z.boolean(),
  openingCount: z.number().int().nonnegative(),
});
export type CabinetSummary = z.infer<typeof CabinetSummary>;

/** GET …/revisions/:rev */
export const RevisionDetail = RevisionContext.extend({
  revision: RevisionSummary,
  cabinets: z.array(CabinetSummary),
  /** The machine's WORKING revision number, if it has one (may be this one). */
  workingRev: z.number().int().nullable(),
});
export type RevisionDetail = z.infer<typeof RevisionDetail>;

/** GET …/cabinets/:cabinetId */
export const CabinetDetail = Cabinet.extend({
  type: CabinetType,
  platen: Platen.nullable(),
  openings: z.array(Opening),
  context: RevisionContext,
});
export type CabinetDetail = z.infer<typeof CabinetDetail>;
