import {
  CabinetParams,
  CreatePlacementInput,
  LayoutChanges,
  PlacementParams,
  UpdatePlacementInput,
} from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  applyLayoutChanges,
  createPlacement,
  deletePlacement,
  getLayout,
  updatePlacement,
} from "../services/placements.js";

export interface PlacementsRoutesOptions {
  db: PrismaClient;
}

const CAB = "/projects/:projectId/machines/:machineId/revisions/:rev/cabinets/:cabinetId";

/** The platen layout of one cabinet. Reads: any user. Writes: `projects`. */
export const placementsRoutes: FastifyPluginCallback<PlacementsRoutesOptions> = (
  app,
  { db },
  done,
) => {
  const write = { preHandler: requirePermission("projects") };

  app.get(`${CAB}/layout`, { preHandler: requireAuth }, (request) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    return getLayout(db, ref, cabinetId);
  });

  app.post(`${CAB}/placements`, write, async (request, reply) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    const placement = await createPlacement(
      db,
      ref,
      cabinetId,
      CreatePlacementInput.parse(request.body),
    );
    return reply.code(201).send(placement);
  });

  app.patch(`${CAB}/placements/:placementId`, write, (request) => {
    const { cabinetId, placementId, ...ref } = PlacementParams.parse(request.params);
    return updatePlacement(
      db,
      ref,
      cabinetId,
      placementId,
      UpdatePlacementInput.parse(request.body),
    );
  });

  app.post(`${CAB}/layout/changes`, write, (request) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    return applyLayoutChanges(db, ref, cabinetId, LayoutChanges.parse(request.body));
  });

  app.delete(`${CAB}/placements/:placementId`, write, async (request, reply) => {
    const { cabinetId, placementId, ...ref } = PlacementParams.parse(request.params);
    await deletePlacement(db, ref, cabinetId, placementId);
    return reply.code(204).send();
  });

  done();
};
