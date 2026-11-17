import Fastify, { type FastifyServerOptions } from "fastify";
import { registerAuth, type AuthConfig } from "./auth/plugin.js";
import { errorHandler } from "./errors.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { authRoutes } from "./routes/auth.js";
import { cabinetsRoutes } from "./routes/cabinets.js";
import { glandsRoutes } from "./routes/glands.js";
import { healthRoutes } from "./routes/health.js";
import { projectsRoutes } from "./routes/projects.js";
import { usersRoutes } from "./routes/users.js";

export interface AppDeps {
  db: PrismaClient;
  pingDb: () => Promise<void>;
  auth: AuthConfig;
}

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.setErrorHandler(errorHandler);
  await registerAuth(app, deps.db, deps.auth);

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { pingDb: deps.pingDb });
      await api.register(authRoutes, { db: deps.db, auth: deps.auth });
      await api.register(usersRoutes, { db: deps.db });
      await api.register(projectsRoutes, { db: deps.db });
      await api.register(cabinetsRoutes, { db: deps.db });
      await api.register(glandsRoutes, { db: deps.db });
    },
    { prefix: "/api" },
  );

  return app;
}
