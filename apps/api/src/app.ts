import Fastify, { type FastifyServerOptions } from "fastify";
import { healthRoutes } from "./routes/health.js";

export interface AppDeps {
  pingDb: () => Promise<void>;
}

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { pingDb: deps.pingDb });
    },
    { prefix: "/api" },
  );

  return app;
}
