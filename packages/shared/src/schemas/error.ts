import { z } from "zod";

/** Body of every non-2xx API response. */
export const ApiErrorBody = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Field errors for 400s caused by invalid input, keyed by dotted path. */
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
