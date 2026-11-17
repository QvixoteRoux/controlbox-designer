import {
  CabinetParams,
  CreateCabinetInput,
  GlandArrayInput,
  OpeningInput,
  OpeningParams,
  RevisionParams,
  SetWindowInput,
  UpdateCabinetInput,
  UpdatePlatenInput,
} from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { requireAuth, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  createCabinet,
  createGlandArray,
  createOpening,
  deleteCabinet,
  deleteOpening,
  getCabinet,
  getRevisionDetail,
  listCabinetTypes,
  replaceOpening,
  setWindow,
  updateCabinet,
  updatePlaten,
} from "../services/cabinets.js";

export interface CabinetsRoutesOptions {
  db: PrismaClient;
}

const REV = "/projects/:projectId/machines/:machineId/revisions/:rev";
const CAB = `${REV}/cabinets/:cabinetId`;

/** A revision's cabinets, platens and openings. Reads: any user. Writes: `projects`. */
export const cabinetsRoutes: FastifyPluginCallback<CabinetsRoutesOptions> = (app, { db }, done) => {
  const read = { preHandler: requireAuth };
  const write = { preHandler: requirePermission("projects") };

  app.get("/cabinet-types", read, () => listCabinetTypes(db));

  app.get(REV, read, (request) => getRevisionDetail(db, RevisionParams.parse(request.params)));

  app.post(`${REV}/cabinets`, write, async (request, reply) => {
    const ref = RevisionParams.parse(request.params);
    const cabinet = await createCabinet(db, ref, CreateCabinetInput.parse(request.body));
    return reply.code(201).send(cabinet);
  });

  app.get(CAB, read, (request) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    return getCabinet(db, ref, cabinetId);
  });

  app.patch(CAB, write, (request) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    return updateCabinet(db, ref, cabinetId, UpdateCabinetInput.parse(request.body));
  });

  app.delete(CAB, write, async (request, reply) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    await deleteCabinet(db, ref, cabinetId);
    return reply.code(204).send();
  });

  app.put(`${CAB}/platen`, write, (request) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    return updatePlaten(db, ref, cabinetId, UpdatePlatenInput.parse(request.body));
  });

  app.put(`${CAB}/window`, write, async (request, reply) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    await setWindow(db, ref, cabinetId, SetWindowInput.parse(request.body).hasWindow);
    return reply.code(204).send();
  });

  app.post(`${CAB}/openings`, write, async (request, reply) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    const opening = await createOpening(db, ref, cabinetId, OpeningInput.parse(request.body));
    return reply.code(201).send(opening);
  });

  app.post(`${CAB}/openings/gland-array`, write, async (request, reply) => {
    const { cabinetId, ...ref } = CabinetParams.parse(request.params);
    const openings = await createGlandArray(
      db,
      ref,
      cabinetId,
      GlandArrayInput.parse(request.body),
    );
    return reply.code(201).send(openings);
  });

  app.put(`${CAB}/openings/:openingId`, write, (request) => {
    const { cabinetId, openingId, ...ref } = OpeningParams.parse(request.params);
    return replaceOpening(db, ref, cabinetId, openingId, OpeningInput.parse(request.body));
  });

  app.delete(`${CAB}/openings/:openingId`, write, async (request, reply) => {
    const { cabinetId, openingId, ...ref } = OpeningParams.parse(request.params);
    await deleteOpening(db, ref, cabinetId, openingId);
    return reply.code(204).send();
  });

  done();
};
