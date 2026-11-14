import { z } from "zod";
import { Id, Timestamp } from "./common.js";
import { Role } from "./enums.js";

const designerHasPermission = (u: { role: Role; canProjects: boolean; canComponents: boolean }) =>
  u.role !== "DESIGNER" || u.canProjects || u.canComponents;
const designerHasPermissionError = {
  message: "A designer needs at least one permission (Projects or Components)",
  path: ["canProjects"],
};

/** A user as returned by the API. The password hash never leaves the server. */
export const User = z.object({
  id: Id,
  username: z.string(),
  displayName: z.string(),
  role: Role,
  canProjects: z.boolean(),
  canComponents: z.boolean(),
  active: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type User = z.infer<typeof User>;

export const Username = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "Letters, digits, dot, dash and underscore only");

export const Password = z.string().min(8).max(200);

export const CreateUserInput = z
  .object({
    username: Username,
    displayName: z.string().trim().min(1).max(100),
    password: Password,
    role: Role.default("VIEWER"),
    canProjects: z.boolean().default(true),
    canComponents: z.boolean().default(true),
  })
  .refine(designerHasPermission, designerHasPermissionError);
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const LoginInput = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;
