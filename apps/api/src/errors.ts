import type { ApiErrorBody } from "@cabinet-planner/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { STATUS_CODES } from "node:http";
import { z } from "zod";

/** Throw from routes and services; the error handler turns it into an ApiErrorBody. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const body = (statusCode: number, message: string, fields?: ApiErrorBody["fields"]) =>
  ({
    statusCode,
    error: STATUS_CODES[statusCode] ?? "Error",
    message,
    ...(fields && { fields }),
  }) satisfies ApiErrorBody;

export function errorHandler(err: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof z.ZodError) {
    const { fieldErrors } = z.flattenError(err);
    return reply.code(400).send(body(400, "Invalid input", fieldErrors));
  }
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send(body(err.statusCode, err.message));
  }

  // Fastify's own errors (malformed JSON, unsupported media type…) carry a 4xx statusCode.
  const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (statusCode === 500) {
    request.log.error({ err }, "unhandled error");
    return reply.code(500).send(body(500, "Something went wrong on the server"));
  }
  return reply.code(statusCode).send(body(statusCode, err.message));
}
