import {
  CatalogTypeKind,
  CreateCatalogTypeInput,
  UpdateCatalogTypeInput,
} from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createType, deleteType, listTypes, updateType } from "../services/catalogTypes.js";

export interface CatalogTypesRoutesOptions {
  db: PrismaClient;
}

const KindParams = z.object({ kind: CatalogTypeKind });
const TypeParams = KindParams.extend({ id: z.coerce.number().int().positive() });

/**
 * /api/types/cabinet-types and /api/types/component-types: the full lists (inactive included)
 * for managing them. Reads: any user. Writes: `components`.
 */
export const catalogTypesRoutes: FastifyPluginCallback<CatalogTypesRoutesOptions> = (
  app,
  { db },
  done,
) => {
  const write = { preHandler: requirePermission("components") };

  app.get("/types/:kind", { preHandler: requireAuth }, (request) =>
    listTypes(db, KindParams.parse(request.params).kind),
  );

  app.post("/types/:kind", write, async (request, reply) => {
    const { kind } = KindParams.parse(request.params);
    const type = await createType(db, kind, CreateCatalogTypeInput.parse(request.body));
    return reply.code(201).send(type);
  });

  app.patch("/types/:kind/:id", write, (request) => {
    const { kind, id } = TypeParams.parse(request.params);
    return updateType(db, kind, id, UpdateCatalogTypeInput.parse(request.body));
  });

  app.delete("/types/:kind/:id", write, async (request, reply) => {
    const { kind, id } = TypeParams.parse(request.params);
    await deleteType(db, kind, id);
    return reply.code(204).send();
  });

  done();
};
