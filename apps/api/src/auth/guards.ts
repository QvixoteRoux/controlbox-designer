import { can, type Permission } from "@cabinet-planner/shared";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { HttpError } from "../errors.js";
import type { PublicUser } from "./sessions.js";

// The only place routes check access (guidelines/permissions.md): no role checks elsewhere.

/** Any logged-in user. Read-only routes use this, so a VIEWER can look but not change. */
export const requireAuth: preHandlerHookHandler = (request, _reply, done) => {
  done(request.user ? undefined : new HttpError(401, "Please log in"));
};

/** A logged-in user who has `permission` according to the shared can(). */
export const requirePermission =
  (permission: Permission): preHandlerHookHandler =>
  (request, _reply, done) => {
    if (!request.user) return done(new HttpError(401, "Please log in"));
    if (!can(request.user, permission)) {
      return done(new HttpError(403, "You don't have permission to do this"));
    }
    done();
  };

/** The user of a request that already passed requireAuth / requirePermission. */
export function currentUser(request: FastifyRequest): PublicUser {
  if (!request.user) throw new HttpError(401, "Please log in");
  return request.user;
}
