import { z } from "zod";

/** GET /api/health */
export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
  /** Present when db is "down". */
  error: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
