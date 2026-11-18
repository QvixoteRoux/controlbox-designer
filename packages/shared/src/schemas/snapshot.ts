import { z } from "zod";
import { NonNegativeUnits, PositiveUnits } from "./common.js";
import { ComponentKind } from "./enums.js";

// Catalog data frozen into placements and openings when a revision is released
// (guidelines/revisions.md). Released views draw from these, not from the live catalog.

/** The catalog fields used for drawing a component. */
export const ComponentSnapshot = z.object({
  componentId: z.number().int(),
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
  snappable: z.boolean(),
  expandable: z.boolean(),
  /** Fill colour from the part's component type ("#rrggbb"), or null for the kind default. */
  fillColor: z.string().nullable(),
  attributes: z.record(z.string(), z.json()),
  imagePath: z.string().nullable(),
});
export type ComponentSnapshot = z.infer<typeof ComponentSnapshot>;

export const GlandSnapshot = z.object({
  glandId: z.number().int(),
  size: z.string(),
  holeDiameter: PositiveUnits,
  imagePath: z.string().nullable(),
});
export type GlandSnapshot = z.infer<typeof GlandSnapshot>;

/** placement.snapshot */
export const PlacementSnapshot = z.object({ component: ComponentSnapshot });
export type PlacementSnapshot = z.infer<typeof PlacementSnapshot>;

/** cabinet_opening.snapshot (only for openings with a gland or a mounted component). */
export const OpeningSnapshot = z.object({
  gland: GlandSnapshot.nullable(),
  component: ComponentSnapshot.nullable(),
});
export type OpeningSnapshot = z.infer<typeof OpeningSnapshot>;
