import { z } from "zod";
import { Id, NonNegativeUnits, PositiveUnits, Timestamp } from "./common.js";

// One catalog table; `kind` decides what `attributes` holds (guidelines/data-model.md).

export const StandardAttributes = z.strictObject({});
export const FuseAttributes = z.strictObject({
  amperage: z.number().positive(),
  poles: z.number().int().positive(),
});
export const TerminalBlockAttributes = z.strictObject({
  levels: z.number().int().positive(),
});
export const GutterAttributes = z.strictObject({});
export const RailAttributes = z.strictObject({
  profile: z.string().trim().min(1).optional(),
});

const commonFields = {
  typeId: Id.nullable(),
  manufacturer: z.string().trim().min(1),
  partNumber: z.string().trim().min(1),
  /** Internal ID / code. Optional, unique when set. */
  code: z.string().trim().min(1).nullable(),
  description: z.string().nullable(),
  inputVoltage: z.string().nullable(),
  /** AC only: 1 or 3. null for DC or not applicable. */
  phases: z.union([z.literal(1), z.literal(3)]).nullable(),
  height: NonNegativeUnits,
  width: PositiveUnits,
  depth: NonNegativeUnits,
  railMount: z.boolean(),
  /** Distance from the component's top edge to the rail's top edge. Only when railMount. */
  railEdgeOffset: NonNegativeUnits.nullable(),
  stackable: z.boolean(),
  imagePath: z.string().nullable(),
  active: z.boolean(),
};

/** Fields every catalog item has, plus `kind` + the matching `attributes`. */
const ComponentFields = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STANDARD"), attributes: StandardAttributes, ...commonFields }),
  z.object({ kind: z.literal("FUSE"), attributes: FuseAttributes, ...commonFields }),
  z.object({
    kind: z.literal("TERMINAL_BLOCK"),
    attributes: TerminalBlockAttributes,
    ...commonFields,
  }),
  z.object({ kind: z.literal("GUTTER"), attributes: GutterAttributes, ...commonFields }),
  z.object({ kind: z.literal("RAIL"), attributes: RailAttributes, ...commonFields }),
]);

const railOffsetOnlyWhenRailMounted = (c: { railMount: boolean; railEdgeOffset: number | null }) =>
  c.railMount || c.railEdgeOffset === null;
const railOffsetError = {
  message: "Rail edge offset is only allowed on rail-mounted components",
  path: ["railEdgeOffset"],
};

export const ComponentInput = ComponentFields.refine(
  railOffsetOnlyWhenRailMounted,
  railOffsetError,
);
export type ComponentInput = z.infer<typeof ComponentInput>;

export const Component = z
  .intersection(ComponentFields, z.object({ id: Id, createdAt: Timestamp, updatedAt: Timestamp }))
  .refine(railOffsetOnlyWhenRailMounted, railOffsetError);
export type Component = z.infer<typeof Component>;
