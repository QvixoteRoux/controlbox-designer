import { ApiErrorBody } from "@cabinet-planner/shared";
import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-field messages from a 400 caused by invalid input. */
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions<S extends z.ZodType> {
  body?: unknown;
  /** Validates the JSON response. Omit for 204 responses. */
  schema?: S;
  /** Statuses parsed like a 2xx (e.g. 503 from /api/health still has a body). */
  acceptStatuses?: number[];
}

async function request<S extends z.ZodType>(
  method: string,
  path: string,
  { body, schema, acceptStatuses = [] }: RequestOptions<S> = {},
): Promise<z.infer<S>> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    // Only send a JSON content type with a body: Fastify rejects an empty JSON body.
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const parsed = ApiErrorBody.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new ApiError(res.status, parsed.data.message, parsed.data.fields)
      : new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  if (!schema || res.status === 204) return undefined as z.infer<S>;
  return schema.parse(await res.json());
}

export const api = {
  get: <S extends z.ZodType>(path: string, schema: S, acceptStatuses?: number[]) =>
    request("GET", path, { schema, acceptStatuses }),
  post: <S extends z.ZodType>(path: string, body?: unknown, schema?: S) =>
    request("POST", path, { body, schema }),
  patch: <S extends z.ZodType>(path: string, body: unknown, schema?: S) =>
    request("PATCH", path, { body, schema }),
  put: <S extends z.ZodType>(path: string, body: unknown, schema?: S) =>
    request("PUT", path, { body, schema }),
  delete: (path: string) => request("DELETE", path),
};

/** A user-facing message for any error thrown by a query or mutation. */
export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong";
