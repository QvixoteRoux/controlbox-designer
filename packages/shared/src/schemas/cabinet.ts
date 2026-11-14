import { z } from "zod";
import { Extra, Id, PositiveUnits } from "./common.js";
import { CabinetMaterial, Face, HingeSide } from "./enums.js";

const cabinetFields = {
  /** 1, 2, 3… unique within the revision. */
  number: z.number().int().positive(),
  typeId: Id,
  material: CabinetMaterial,
  height: PositiveUnits,
  width: PositiveUnits,
  depth: PositiveUnits,
  hasPlaten: z.boolean(),
  mainVoltage: z.string().trim().min(1),
  otherVoltages: z.array(z.string().trim().min(1)),
  hingeSide: HingeSide,
  upFace: Face,
  extra: Extra,
};

export const Cabinet = z.object({
  id: Id,
  revisionId: Id,
  ...cabinetFields,
});
export type Cabinet = z.infer<typeof Cabinet>;

export const CreateCabinetInput = z.object({
  ...cabinetFields,
  hasPlaten: cabinetFields.hasPlaten.default(true),
  otherVoltages: cabinetFields.otherVoltages.default([]),
  hingeSide: cabinetFields.hingeSide.default("LEFT"),
  upFace: cabinetFields.upFace.default("TOP"),
  extra: cabinetFields.extra.default({}),
});
export type CreateCabinetInput = z.infer<typeof CreateCabinetInput>;

export const CabinetType = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export type CabinetType = z.infer<typeof CabinetType>;

export const Platen = z.object({
  id: Id,
  cabinetId: Id,
  height: PositiveUnits,
  width: PositiveUnits,
});
export type Platen = z.infer<typeof Platen>;

/** Default platen: 50 mm (500 units) smaller than the cabinet in both height and width. */
export const PLATEN_MARGIN = 500;
export const defaultPlatenSize = (cabinet: { height: number; width: number }) => ({
  height: cabinet.height - PLATEN_MARGIN,
  width: cabinet.width - PLATEN_MARGIN,
});
