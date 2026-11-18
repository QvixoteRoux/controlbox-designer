import { z } from "zod";

export const Id = z.number().int().positive();

/** `:id` route parameter (arrives as a string). */
export const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** A length or position in 0.1 mm. Always an integer (guidelines/units-and-coordinates.md). */
export const Units = z.number().int();
/** A size in 0.1 mm that must be > 0. */
export const PositiveUnits = Units.positive();
/** A size in 0.1 mm that may be 0 (e.g. gutter and rail height). */
export const NonNegativeUnits = Units.nonnegative();

/** Timestamps travel as ISO strings in JSON. */
export const Timestamp = z.iso.datetime();

/** Free-form JSON object for fields added later (`extra` columns). */
export const Extra = z.record(z.string(), z.json());

/** A colour as "#rrggbb" (stored lower case). */
export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1e90ff")
  .transform((s) => s.toLowerCase());
