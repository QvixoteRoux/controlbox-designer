import { User, type ChangePasswordInput, type LoginInput } from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";

/** The logged-in user, or null when there's no valid session. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    try {
      return await api.get("/api/auth/me", User);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  staleTime: 5 * 60 * 1000,
  retry: false,
});

/** The logged-in user. Only for components rendered under <RequireAuth>. */
export function useCurrentUser(): User {
  const { data } = useQuery(meQuery);
  if (!data) throw new Error("useCurrentUser used outside <RequireAuth>");
  return data;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post("/api/auth/login", input, User),
    onSuccess: (user) => queryClient.setQueryData(meQuery.queryKey, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSettled: () => {
      // Forget everything cached for this user; <RequireAuth> then sends us to /login.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meQuery.queryKey[0] });
      queryClient.setQueryData(meQuery.queryKey, null);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post("/api/auth/password", input),
  });
}
