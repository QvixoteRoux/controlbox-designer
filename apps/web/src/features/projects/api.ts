import {
  CustomerList,
  Machine,
  MachineDetail,
  MachineRevision,
  Project,
  ProjectDetail,
  ProjectList,
  type CreateMachineInput,
  type CreateProjectInput,
  type UpdateMachineInput,
  type UpdateProjectInput,
} from "@cabinet-planner/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

const projectUrl = (projectId: number) => `/api/projects/${projectId}`;
const machineUrl = (projectId: number, machineId: number) =>
  `${projectUrl(projectId)}/machines/${machineId}`;

// Every query in this feature starts with "projects", so one invalidation refreshes them all.
const ROOT = ["projects"] as const;

export const projectsQuery = (search: string) =>
  queryOptions({
    queryKey: [...ROOT, "list", search],
    queryFn: () =>
      api.get(`/api/projects${search ? `?search=${encodeURIComponent(search)}` : ""}`, ProjectList),
    placeholderData: (previous) => previous,
  });

export const customersQuery = queryOptions({
  queryKey: [...ROOT, "customers"],
  queryFn: () => api.get("/api/customers", CustomerList),
});

export const projectQuery = (projectId: number) =>
  queryOptions({
    queryKey: [...ROOT, projectId],
    queryFn: () => api.get(projectUrl(projectId), ProjectDetail),
  });

export const machineQuery = (projectId: number, machineId: number) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "machines", machineId],
    queryFn: () => api.get(machineUrl(projectId, machineId), MachineDetail),
  });

/** A mutation that refreshes every projects query when it succeeds. */
function useProjectsMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOT }),
  });
}

export const useCreateProject = () =>
  useProjectsMutation((input: CreateProjectInput) => api.post("/api/projects", input, Project));

export const useUpdateProject = (projectId: number) =>
  useProjectsMutation((patch: UpdateProjectInput) =>
    api.patch(projectUrl(projectId), patch, Project),
  );

export const useDeleteProject = (projectId: number) =>
  useProjectsMutation(() => api.delete(projectUrl(projectId)));

export const useCreateMachine = (projectId: number) =>
  useProjectsMutation((input: CreateMachineInput) =>
    api.post(`${projectUrl(projectId)}/machines`, input, Machine),
  );

export const useUpdateMachine = (projectId: number, machineId: number) =>
  useProjectsMutation((patch: UpdateMachineInput) =>
    api.patch(machineUrl(projectId, machineId), patch, Machine),
  );

export const useDeleteMachine = (projectId: number, machineId: number) =>
  useProjectsMutation(() => api.delete(machineUrl(projectId, machineId)));

export const useReleaseRevision = (projectId: number, machineId: number) =>
  useProjectsMutation(({ rev, notes }: { rev: number; notes: string }) =>
    api.post(
      `${machineUrl(projectId, machineId)}/revisions/${rev}/release`,
      { notes },
      MachineRevision,
    ),
  );

export const useCreateRevision = (projectId: number, machineId: number) =>
  useProjectsMutation(() =>
    api.post(`${machineUrl(projectId, machineId)}/revisions`, undefined, MachineRevision),
  );
