import type { HealthResponse } from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";

export interface HealthRoutesOptions {
  /** Resolves when the database answers, rejects otherwise. */
  pingDb: () => Promise<void>;
}

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, { pingDb }, done) => {
  app.get("/health", async (request, reply): Promise<HealthResponse> => {
    try {
      await pingDb();
      return { status: "ok", db: "up" };
    } catch (err) {
      request.log.error({ err }, "health check: database unreachable");
      void reply.code(503);
      return { status: "degraded", db: "down", error: "Database unreachable" };
    }
  });
  done();
};
