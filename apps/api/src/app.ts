import Fastify, { type FastifyServerOptions } from "fastify";
import { registerAuth, type AuthConfig } from "./auth/plugin.js";
import { errorHandler } from "./errors.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { ImageStore } from "./images.js";
import { authRoutes } from "./routes/auth.js";
import { cabinetsRoutes } from "./routes/cabinets.js";
import { catalogTypesRoutes } from "./routes/catalogTypes.js";
import { componentsRoutes } from "./routes/components.js";
import { glandsRoutes } from "./routes/glands.js";
import { healthRoutes } from "./routes/health.js";
import { acceptImageBodies, imagesRoutes } from "./routes/images.js";
import { placementsRoutes } from "./routes/placements.js";
import { projectsRoutes } from "./routes/projects.js";
import { usersRoutes } from "./routes/users.js";

export interface AppDeps {
  db: PrismaClient;
  pingDb: () => Promise<void>;
  auth: AuthConfig;
  images: ImageStore;
}

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.setErrorHandler(errorHandler);
  await registerAuth(app, deps.db, deps.auth);

  await app.register(
    async (api) => {
      acceptImageBodies(api);
      await api.register(healthRoutes, { pingDb: deps.pingDb });
      await api.register(authRoutes, { db: deps.db, auth: deps.auth });
      await api.register(usersRoutes, { db: deps.db });
      await api.register(projectsRoutes, { db: deps.db });
      await api.register(cabinetsRoutes, { db: deps.db });
      await api.register(placementsRoutes, { db: deps.db });
      await api.register(glandsRoutes, { db: deps.db, images: deps.images });
      await api.register(componentsRoutes, { db: deps.db, images: deps.images });
      await api.register(catalogTypesRoutes, { db: deps.db });
      await api.register(imagesRoutes, { images: deps.images });
    },
    { prefix: "/api" },
  );

  return app;
}
