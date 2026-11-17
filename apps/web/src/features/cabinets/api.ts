import {
  Cabinet,
  CabinetDetail,
  CabinetTypeList,
  Opening,
  Platen,
  RevisionDetail,
  type CreateCabinetInput,
  type GlandArrayInput,
  type OpeningInput,
  type UpdateCabinetInput,
  type UpdatePlatenInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

/** Identifies a machine revision, as in the URL. */
export interface RevisionRef {
  projectId: number;
  machineId: number;
  rev: number;
}

export const revisionPath = ({ projectId, machineId, rev }: RevisionRef) =>
  `/projects/${projectId}/machines/${machineId}/revisions/${rev}`;
const cabinetPath = (ref: RevisionRef, cabinetId: number) =>
  `${revisionPath(ref)}/cabinets/${cabinetId}`;

/** Web route of a cabinet page (same shape as the API path, without /api). */
export const cabinetRoute = cabinetPath;

// Keys live under "projects" so that project/machine/revision changes refresh them too.
const revisionKey = (ref: RevisionRef) =>
  ["projects", ref.projectId, "machines", ref.machineId, "revisions", ref.rev] as const;

export const revisionQuery = (ref: RevisionRef) =>
  queryOptions({
    queryKey: revisionKey(ref),
    queryFn: () => api.get(`/api${revisionPath(ref)}`, RevisionDetail),
  });

export const cabinetQuery = (ref: RevisionRef, cabinetId: number) =>
  queryOptions({
    queryKey: [...revisionKey(ref), "cabinets", cabinetId],
    queryFn: () => api.get(`/api${cabinetPath(ref, cabinetId)}`, CabinetDetail),
  });

export const cabinetTypesQuery = queryOptions({
  queryKey: ["cabinet-types"],
  queryFn: () => api.get("/api/cabinet-types", CabinetTypeList),
  staleTime: 10 * 60 * 1000,
});

/** A mutation that refreshes the revision and everything under it when it succeeds. */
function useRevisionMutation<TInput, TResult>(
  ref: RevisionRef,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: revisionKey(ref) }),
        // Glands show whether they're in use.
        queryClient.invalidateQueries({ queryKey: ["cable-glands"] }),
      ]),
  });
}

export const useCreateCabinet = (ref: RevisionRef) =>
  useRevisionMutation(ref, (input: CreateCabinetInput) =>
    api.post(`/api${revisionPath(ref)}/cabinets`, input, Cabinet),
  );

export const useUpdateCabinet = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, (patch: UpdateCabinetInput) =>
    api.patch(`/api${cabinetPath(ref, cabinetId)}`, patch, Cabinet),
  );

export const useDeleteCabinet = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, () => api.delete(`/api${cabinetPath(ref, cabinetId)}`));

export const useUpdatePlaten = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, (size: UpdatePlatenInput) =>
    api.put(`/api${cabinetPath(ref, cabinetId)}/platen`, size, Platen),
  );

export const useSetWindow = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, (hasWindow: boolean) =>
    api.put(`/api${cabinetPath(ref, cabinetId)}/window`, { hasWindow }),
  );

export const useSaveOpening = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, ({ id, input }: { id?: number; input: OpeningInput }) =>
    id === undefined
      ? api.post(`/api${cabinetPath(ref, cabinetId)}/openings`, input, Opening)
      : api.put(`/api${cabinetPath(ref, cabinetId)}/openings/${id}`, input, Opening),
  );

export const useCreateGlandArray = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, (input: GlandArrayInput) =>
    api.post(`/api${cabinetPath(ref, cabinetId)}/openings/gland-array`, input, Opening.array()),
  );

export const useDeleteOpening = (ref: RevisionRef, cabinetId: number) =>
  useRevisionMutation(ref, (openingId: number) =>
    api.delete(`/api${cabinetPath(ref, cabinetId)}/openings/${openingId}`),
  );
