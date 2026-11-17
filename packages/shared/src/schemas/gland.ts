import { z } from "zod";
import { Id, PositiveUnits } from "./common.js";

// Cable glands: a minimal catalog list (size + hole diameter) so gland openings can be placed
// before the full component catalog exists. Images come with the catalog feature.

export const CableGland = z.object({
  id: Id,
  /** "M20", "PG13.5", "1/2in NPT"… unique. */
  size: z.string(),
  /** Hole to cut in the cabinet, in 0.1 mm. */
  holeDiameter: PositiveUnits,
  imagePath: z.string().nullable(),
  active: z.boolean(),
});
export type CableGland = z.infer<typeof CableGland>;
export const CableGlandList = z.array(CableGland.extend({ inUse: z.boolean() }));
export type CableGlandListItem = z.infer<typeof CableGlandList>[number];

/** What an opening shows about its gland. */
export const GlandRef = CableGland.pick({ id: true, size: true, holeDiameter: true });
export type GlandRef = z.infer<typeof GlandRef>;

const GlandSize = z.string().trim().min(1, "Required").max(40);

export const CreateCableGlandInput = z.object({ size: GlandSize, holeDiameter: PositiveUnits });
export type CreateCableGlandInput = z.infer<typeof CreateCableGlandInput>;

export const UpdateCableGlandInput = z
  .strictObject({ size: GlandSize, holeDiameter: PositiveUnits, active: z.boolean() })
  .partial()
  .refine((g) => Object.keys(g).length > 0, "Nothing to update");
export type UpdateCableGlandInput = z.infer<typeof UpdateCableGlandInput>;
