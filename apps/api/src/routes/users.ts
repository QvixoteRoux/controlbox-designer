import {
  CreateUserInput,
  IdParams,
  ResetPasswordInput,
  UpdateUserInput,
} from "@cabinet-planner/shared";
import type { FastifyPluginCallback } from "fastify";
import { currentUser, requirePermission } from "../auth/guards.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createUser, listUsers, resetPassword, updateUser } from "../services/users.js";

export interface UsersRoutesOptions {
  db: PrismaClient;
}

/** User administration. Admin only, including reads. */
export const usersRoutes: FastifyPluginCallback<UsersRoutesOptions> = (app, { db }, done) => {
  app.addHook("preHandler", requirePermission("admin"));

  app.get("/users", () => listUsers(db));

  app.post("/users", async (request, reply) => {
    const user = await createUser(db, CreateUserInput.parse(request.body));
    return reply.code(201).send(user);
  });

  app.patch("/users/:id", (request) => {
    const { id } = IdParams.parse(request.params);
    return updateUser(db, id, UpdateUserInput.parse(request.body));
  });

  app.post("/users/:id/password", async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { password } = ResetPasswordInput.parse(request.body);
    // An admin resetting their own password stays logged in here; everywhere else ends.
    const keep = currentUser(request).id === id ? request.sessionId : null;
    await resetPassword(db, id, password, keep);
    return reply.code(204).send();
  });

  done();
};
