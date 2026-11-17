import {
  CatalogType,
  CatalogTypeList,
  ComponentList,
  ComponentListItem,
  type CatalogTypeKind,
  type ComponentInput,
  type CreateCatalogTypeInput,
  type UpdateCatalogTypeInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const componentsQuery = queryOptions({
  queryKey: ["components"],
  queryFn: () => api.get("/api/components", ComponentList),
});

/** Full type lists (inactive ones included) for managing them and for pickers. */
export const typesQuery = (kind: CatalogTypeKind) =>
  queryOptions({
    queryKey: ["types", kind],
    queryFn: () => api.get(`/api/types/${kind}`, CatalogTypeList),
  });

function useCatalogMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Types show "in use", openings show mounted parts: refresh everything that lists them.
    onSuccess: () =>
      Promise.all(
        [["components"], ["types"], ["cabinet-types"], ["projects"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const useSaveComponent = () =>
  useCatalogMutation(({ id, input }: { id?: number; input: ComponentInput }) =>
    id === undefined
      ? api.post("/api/components", input, ComponentListItem)
      : api.put(`/api/components/${id}`, input, ComponentListItem),
  );

export const useDeleteComponent = () =>
  useCatalogMutation((id: number) => api.delete(`/api/components/${id}`));

/** Uploads (File) or removes (null) a component's picture. */
export const useComponentImage = () =>
  useCatalogMutation(({ id, file }: { id: number; file: File | null }) =>
    file
      ? api.put(`/api/components/${id}/image`, file, ComponentListItem)
      : api.deleteWith(`/api/components/${id}/image`, ComponentListItem),
  );

export const useSaveType = (kind: CatalogTypeKind) =>
  useCatalogMutation(
    (args: { id: number; patch: UpdateCatalogTypeInput } | { input: CreateCatalogTypeInput }) =>
      "id" in args
        ? api.patch(`/api/types/${kind}/${args.id}`, args.patch, CatalogType)
        : api.post(`/api/types/${kind}`, args.input, CatalogType),
  );

export const useDeleteType = (kind: CatalogTypeKind) =>
  useCatalogMutation((id: number) => api.delete(`/api/types/${kind}/${id}`));
