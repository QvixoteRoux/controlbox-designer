import { ComponentInput, ComponentParams } from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ImageStore } from "../images.js";
import {
  createComponent,
  deleteComponent,
  getComponent,
  listComponents,
  setComponentImage,
  updateComponent,
} from "../services/components.js";
import { storeUploadedImage } from "./images.js";

export interface ComponentsRoutesOptions {
  db: PrismaClient;
  images: ImageStore;
}

/** The component catalog. Reads: any user. Writes: `components`. */
export const componentsRoutes: FastifyPluginCallback<ComponentsRoutesOptions> = (
  app,
  { db, images },
  done,
) => {
  const read = { preHandler: requireAuth };
  const write = { preHandler: requirePermission("components") };
  const idOf = (params: unknown) => ComponentParams.parse(params).id;

  app.get("/components", read, () => listComponents(db));
  app.get("/components/:id", read, (request) => getComponent(db, idOf(request.params)));

  app.post("/components", write, async (request, reply) => {
    const component = await createComponent(db, ComponentInput.parse(request.body));
    return reply.code(201).send(component);
  });

  app.put("/components/:id", write, (request) =>
    updateComponent(db, idOf(request.params), ComponentInput.parse(request.body)),
  );

  app.delete("/components/:id", write, async (request, reply) => {
    await deleteComponent(db, idOf(request.params));
    return reply.code(204).send();
  });

  app.put("/components/:id/image", write, async (request) => {
    const id = idOf(request.params);
    await getComponent(db, id); // 404 before storing anything
    const key = await storeUploadedImage(images, request, "components", id);
    return setComponentImage(db, id, key);
  });

  app.delete("/components/:id/image", write, (request) =>
    setComponentImage(db, idOf(request.params), null),
  );

  done();
};
