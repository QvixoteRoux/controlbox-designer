import {
  CableGland,
  CableGlandList,
  type CreateCableGlandInput,
  type UpdateCableGlandInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const glandsQuery = queryOptions({
  queryKey: ["cable-glands"],
  queryFn: () => api.get("/api/cable-glands", CableGlandList),
});

function useGlandsMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Openings show gland sizes, so refresh project data as well.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: glandsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]),
  });
}

export const useCreateGland = () =>
  useGlandsMutation((input: CreateCableGlandInput) =>
    api.post("/api/cable-glands", input, CableGland),
  );

export const useUpdateGland = () =>
  useGlandsMutation(({ id, patch }: { id: number; patch: UpdateCableGlandInput }) =>
    api.patch(`/api/cable-glands/${id}`, patch, CableGland),
  );

export const useDeleteGland = () =>
  useGlandsMutation((id: number) => api.delete(`/api/cable-glands/${id}`));
