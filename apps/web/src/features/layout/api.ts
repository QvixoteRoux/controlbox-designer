import {
  LayoutChangesResult,
  LayoutDetail,
  withPatch,
  type LayoutChange,
  type Placement,
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
 * Every editor write is a batch of changes (POST …/layout/changes), so a multi-select move,
 * a delete and an undo are each one save. The cached layout changes first (optimistic: moves
 * and deletes show at once, new parts once the server answers); the server's answer then
 * replaces it. A failure rolls back and shows a toast.
 */
export function useLayoutChanges(ref: RevisionRef, cabinetId: number) {
  const queryClient = useQueryClient();
  const key = layoutKey(ref, cabinetId);
  return useMutation({
    mutationFn: (changes: LayoutChange[]) =>
      api.post(`${apiBase(ref, cabinetId)}/layout/changes`, { changes }, LayoutChangesResult),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LayoutDetail>(key);
      if (previous) {
        queryClient.setQueryData(key, {
          ...previous,
          placements: predict(previous.placements, changes),
        });
      }
      return { previous };
    },
    onError: (err, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      notifications.show({ color: "red", message: errorMessage(err) });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LayoutDetail>(key, (layout) =>
        layout ? { ...layout, placements: result.placements } : layout,
      );
    },
  });
}

/** The layout as the API will leave it, as far as it can be known before it answers. */
function predict(placements: Placement[], changes: LayoutChange[]): Placement[] {
  let next = placements;
  for (const c of changes) {
    if (c.op === "update") {
      next = withPatch(next, c.id, c.patch as Partial<Placement>);
    } else if (c.op === "delete") {
      next = next
        .filter((p) => p.id !== c.id)
        .map((p) => (p.railId === c.id ? { ...p, railId: null } : p));
    }
  }
  return [...next].sort((a, b) => a.zIndex - b.zIndex || a.id - b.id);
}
