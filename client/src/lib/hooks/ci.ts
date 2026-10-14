/* hooks/ci.ts — React Query hooks for Export to CI, the agent CI tab and CI Runs (SPEC-08). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, postBlob, postWithStatus } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPreview,
  CiRefreshResult,
  CiRunsPage,
  CiRunsQuery,
  CiSecretStatus,
  CiTargetOption,
} from "@devdigest/shared";

export function useCiTargets() {
  return useQuery({
    queryKey: ["ci", "targets"],
    queryFn: () => api.get<CiTargetOption[]>("/ci/targets"),
    staleTime: Infinity,
  });
}

/** Preview is a POST used as a query, keyed on the whole input; disabled while input is null. */
export function useCiPreview(agentId: string, input: CiExportInputBody | null) {
  return useQuery({
    queryKey: ["ci", "preview", agentId, input],
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    enabled: input !== null,
    retry: false,
  });
}

export function useCiSecrets(agentId: string, repo: string | null) {
  return useQuery({
    queryKey: ["ci", "secrets", agentId, repo],
    queryFn: () =>
      api.get<CiSecretStatus[]>(`/agents/${agentId}/ci/secrets?repo=${encodeURIComponent(repo ?? "")}`),
    enabled: !!repo,
    retry: false,
  });
}

/** Export opens/updates the `devdigest/ci` PR. 201 = new installation, 200 = updated or refused. */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) =>
      postWithStatus<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci", "installations", agentId] }),
  });
}

export function useCiArchive(agentId: string) {
  return useMutation({
    mutationFn: (input: CiExportInputBody) => postBlob(`/agents/${agentId}/export-ci/archive`, input),
  });
}

export function useCiInstallations(agentId: string) {
  return useQuery({
    queryKey: ["ci", "installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
  });
}

function runsQueryString(query: Partial<CiRunsQuery>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function useCiRuns(query: Partial<CiRunsQuery>) {
  return useQuery({
    queryKey: ["ci", "runs", query],
    queryFn: () => api.get<CiRunsPage>(`/ci/runs${runsQueryString(query)}`),
  });
}

export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => api.post<CiRefreshResult>("/ci/refresh", { force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci", "runs"] });
      qc.invalidateQueries({ queryKey: ["ci", "installations"] });
    },
  });
}
