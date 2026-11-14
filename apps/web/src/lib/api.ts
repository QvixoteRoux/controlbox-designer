import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * GET a JSON endpoint and validate the body with its shared Zod schema.
 * Statuses in `acceptStatuses` are parsed like a 2xx (e.g. 503 from /api/health still has a body).
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  acceptStatuses: number[] = [],
): Promise<z.infer<S>> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok && !acceptStatuses.includes(res.status)) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}
