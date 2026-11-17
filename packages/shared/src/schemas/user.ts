import { z } from "zod";
import { Id, Timestamp } from "./common.js";
import { Role } from "./enums.js";

/** A DESIGNER must keep at least one of the two permissions (also a DB check). */
export const designerHasPermission = (u: {
  role: Role;
  canProjects: boolean;
  canComponents: boolean;
}) => u.role !== "DESIGNER" || u.canProjects || u.canComponents;
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

export const Password = z.string().min(8, "At least 8 characters").max(200);

export const DisplayName = z.string().trim().min(1, "Required").max(100);

export const UserList = z.array(User);
export type UserList = z.infer<typeof UserList>;

export const CreateUserInput = z
  .object({
    username: Username,
    displayName: DisplayName,
    password: Password,
    role: Role.default("VIEWER"),
    canProjects: z.boolean().default(true),
    canComponents: z.boolean().default(true),
  })
  .refine(designerHasPermission, designerHasPermissionError);
export type CreateUserInput = z.infer<typeof CreateUserInput>;

/**
 * PATCH /api/users/:id (admin). Every field is optional; the API checks the designer rule
 * against the merged result, since the stored values fill in what's left out.
 */
export const UpdateUserInput = z
  .strictObject({
    displayName: DisplayName,
    role: Role,
    canProjects: z.boolean(),
    canComponents: z.boolean(),
    active: z.boolean(),
  })
  .partial()
  .refine((u) => Object.keys(u).length > 0, "Nothing to update");
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** The admin edit form: every editable field present, designer rule checked. */
export const EditUserForm = z
  .object({
    displayName: DisplayName,
    role: Role,
    canProjects: z.boolean(),
    canComponents: z.boolean(),
    active: z.boolean(),
  })
  .refine(designerHasPermission, designerHasPermissionError);
export type EditUserForm = z.infer<typeof EditUserForm>;

/** POST /api/users/:id/password (admin reset). */
export const ResetPasswordInput = z.object({ password: Password });
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

/** POST /api/auth/password (a user changing their own password). */
export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: Password,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const LoginInput = z.object({
  username: z.string().trim().min(1, "Required"),
  password: z.string().min(1, "Required"),
});
export type LoginInput = z.infer<typeof LoginInput>;
