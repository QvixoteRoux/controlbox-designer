import { CreateCableGlandInput, IdParams, UpdateCableGlandInput } from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ImageStore } from "../images.js";
import {
  createGland,
  deleteGland,
  listGlands,
  setGlandImage,
  updateGland,
} from "../services/glands.js";
import { storeUploadedImage } from "./images.js";

export interface GlandsRoutesOptions {
  db: PrismaClient;
  images: ImageStore;
}

/** Cable gland list. Reads: any user. Writes: `components` (catalog permission). */
export const glandsRoutes: FastifyPluginCallback<GlandsRoutesOptions> = (
  app,
  { db, images },
  done,
) => {
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

  app.put("/cable-glands/:id/image", write, async (request) => {
    const { id } = IdParams.parse(request.params);
    await setGlandImage(db, id, undefined); // 404 before storing anything
    const key = await storeUploadedImage(images, request, "cable-glands", id);
    return setGlandImage(db, id, key);
  });

  app.delete("/cable-glands/:id/image", write, (request) =>
    setGlandImage(db, IdParams.parse(request.params).id, null),
  );

  done();
};
