import {
  User,
  UserList,
  type CreateUserInput,
  type UpdateUserInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { meQuery } from "../auth/api";

export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: () => api.get("/api/users", UserList),
});

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  // An admin may have edited themselves, so refresh "me" as well.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: usersQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post("/api/users", input, User),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateUserInput }) =>
      api.patch(`/api/users/${id}`, patch, User),
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.post(`/api/users/${id}/password`, { password }),
  });
}

/** True when `user` is the only active ADMIN, so they can't be demoted or deactivated. */
export const isLastActiveAdmin = (user: User, users: User[]) =>
  user.role === "ADMIN" &&
  user.active &&
  users.filter((u) => u.role === "ADMIN" && u.active).length === 1;
