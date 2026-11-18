import {
  LayoutDetail,
  Placement,
  withPatch,
  type CreatePlacementInput,
  type UpdatePlacementInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { api, errorMessage } from "../../lib/api";
import { cabinetRoute, type RevisionRef } from "../cabinets/api";

/** Web route of a cabinet's layout editor. */
export const layoutRoute = (ref: RevisionRef, cabinetId: number) =>
  `${cabinetRoute(ref, cabinetId)}/layout`;

const apiBase = (ref: RevisionRef, cabinetId: number) => `/api${cabinetRoute(ref, cabinetId)}`;

// Under the cabinet's key, so anything that refreshes the cabinet refreshes its layout too.
const layoutKey = (ref: RevisionRef, cabinetId: number) =>
  [
    "projects",
    ref.projectId,
    "machines",
    ref.machineId,
    "revisions",
    ref.rev,
    "cabinets",
    cabinetId,
    "layout",
  ] as const;

export const layoutQuery = (ref: RevisionRef, cabinetId: number) =>
  queryOptions({
    queryKey: layoutKey(ref, cabinetId),
    queryFn: () => api.get(`${apiBase(ref, cabinetId)}/layout`, LayoutDetail),
  });

/**
 * Layout writes apply to the cached layout first (optimistic), so dragging feels instant.
 * A failure rolls the change back and shows a toast; the server stays authoritative.
 */
function useLayoutMutation<TInput, TResult>(
  ref: RevisionRef,
  cabinetId: number,
  mutationFn: (input: TInput) => Promise<TResult>,
  optimistic: (layout: LayoutDetail, input: TInput) => LayoutDetail,
  settle?: (layout: LayoutDetail, result: TResult, input: TInput) => LayoutDetail,
) {
  const queryClient = useQueryClient();
  const key = layoutKey(ref, cabinetId);
  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LayoutDetail>(key);
      if (previous) queryClient.setQueryData(key, optimistic(previous, input));
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      notifications.show({ color: "red", message: errorMessage(err) });
    },
    onSuccess: (result, input) => {
      if (!settle) return;
      queryClient.setQueryData<LayoutDetail>(key, (layout) =>
        layout ? settle(layout, result, input) : layout,
      );
    },
  });
}

const replace = (layout: LayoutDetail, placement: Placement): LayoutDetail => ({
  ...layout,
  placements: layout.placements.map((p) => (p.id === placement.id ? placement : p)),
});

export const useCreatePlacement = (ref: RevisionRef, cabinetId: number) =>
  useLayoutMutation(
    ref,
    cabinetId,
    (input: CreatePlacementInput) =>
      api.post(`${apiBase(ref, cabinetId)}/placements`, input, Placement),
    (layout) => layout, // drawn once the server answers (it fills in length and z-order)
    (layout, created) => ({ ...layout, placements: [...layout.placements, created] }),
  );

export const useUpdatePlacement = (ref: RevisionRef, cabinetId: number) =>
  useLayoutMutation(
    ref,
    cabinetId,
    ({ id, patch }: { id: number; patch: UpdatePlacementInput }) =>
      api.patch(`${apiBase(ref, cabinetId)}/placements/${id}`, patch, Placement),
    // withPatch: a moved rail carries its parts, exactly as the API does.
    (layout, { id, patch }) => ({
      ...layout,
      placements: withPatch(layout.placements, id, patch).sort(
        (a, b) => a.zIndex - b.zIndex || a.id - b.id,
      ),
    }),
    replace,
  );

export const useDeletePlacement = (ref: RevisionRef, cabinetId: number) =>
  useLayoutMutation(
    ref,
    cabinetId,
    (id: number) => api.delete(`${apiBase(ref, cabinetId)}/placements/${id}`),
    // Parts on a deleted rail stay where they are, off the rail.
    (layout, id) => ({
      ...layout,
      placements: layout.placements
        .filter((p) => p.id !== id)
        .map((p) => (p.railId === id ? { ...p, railId: null } : p)),
    }),
  );
