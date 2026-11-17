import { CreateCableGlandInput, IdParams, UpdateCableGlandInput } from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createGland, deleteGland, listGlands, updateGland } from "../services/glands.js";

export interface GlandsRoutesOptions {
  db: PrismaClient;
}

/** Cable gland list. Reads: any user. Writes: `components` (catalog permission). */
export const glandsRoutes: FastifyPluginCallback<GlandsRoutesOptions> = (app, { db }, done) => {
  const write = { preHandler: requirePermission("components") };

  app.get("/cable-glands", { preHandler: requireAuth }, () => listGlands(db));

  app.post("/cable-glands", write, async (request, reply) => {
    const gland = await createGland(db, CreateCableGlandInput.parse(request.body));
    return reply.code(201).send(gland);
  });

  app.patch("/cable-glands/:id", write, (request) => {
    const { id } = IdParams.parse(request.params);
    return updateGland(db, id, UpdateCableGlandInput.parse(request.body));
  });

  app.delete("/cable-glands/:id", write, async (request, reply) => {
    await deleteGland(db, IdParams.parse(request.params).id);
    return reply.code(204).send();
  });

  done();
};
