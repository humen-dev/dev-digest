/* hooks/eval.ts — React Query hooks for the eval pipeline (SPEC-05): cases, runs,
   the per-agent eval page, the dashboard and Compare. Routes: plan §3.4 (R1).
   The poll target `GET /eval-runs/:id` is re-read every 3 s only while `running`
   and, on the terminal status, invalidates the queries the run changed. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentDetail,
  EvalCase,
  EvalCaseDetail,
  EvalCaseDraftResponse,
  EvalCaseInput,
  EvalCaseListItem,
  EvalCasePatch,
  EvalCaseRunInput,
  EvalCaseRunResult,
  EvalCompare,
  EvalDashboard,
  EvalRunAllResult,
  EvalRunDetail,
  EvalRunEstimate,
  EvalRunRecord,
  EvalRunStarted,
} from "@devdigest/shared";

/** How often a running eval run is re-read (AC-32). */
export const EVAL_RUN_POLL_MS = 3_000;

export const evalCasesKey = (agentId: string) => ["eval-cases", agentId] as const;
export const evalCaseKey = (id: string) => ["eval-case", id] as const;
export const evalEstimateKey = (agentId: string) => ["eval-estimate", agentId] as const;
export const evalRunsKey = (agentId: string) => ["eval-runs", agentId] as const;
export const evalRunKey = (id: string) => ["eval-run", id] as const;
export const evalAgentKey = (agentId: string) => ["eval-agent", agentId] as const;
export const evalDashboardKey = ["eval-dashboard"] as const;

/** Everything a finished/started run can change for one agent. */
function invalidateAgentEval(qc: QueryClient, agentId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: evalCasesKey(agentId) }),
    qc.invalidateQueries({ queryKey: evalRunsKey(agentId) }),
    qc.invalidateQueries({ queryKey: evalAgentKey(agentId) }),
    qc.invalidateQueries({ queryKey: evalEstimateKey(agentId) }),
    qc.invalidateQueries({ queryKey: evalDashboardKey }),
  ]);
}

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalCasesKey(agentId ?? ""),
    queryFn: () => api.get<EvalCaseListItem[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useEvalCase(id: string | null | undefined) {
  return useQuery({
    queryKey: evalCaseKey(id ?? ""),
    queryFn: () => api.get<EvalCaseDetail>(`/eval-cases/${id}`),
    enabled: !!id,
  });
}

/** SPEC-06 AC-1/AC-2: GET /findings/:id/eval-case-draft — a read-only draft or the finding's existing case.
 *  A mutation over GET (fired on click, never cached). */
export function useEvalCaseDraft() {
  return useMutation({
    mutationFn: (findingId: string) => api.get<EvalCaseDraftResponse>(`/findings/${findingId}/eval-case-draft`),
  });
}

/** AC-91: POST /findings/:id/eval-case with the edited draft → 201 (created) or 200 (already exists). */
export function useSaveEvalCaseFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/findings/${findingId}/eval-case`, input),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: evalCaseKey(c.id) });
      return invalidateAgentEval(qc, c.owner_id);
    },
  });
}

/** AC-94: POST /agents/:id/eval-cases/run — synchronous dry run, nothing stored, so nothing to invalidate.
 *  Deliberately no AbortSignal / timeout: the call may take up to ~120 s (NFR-14). */
export function useRunEvalCase(agentId: string) {
  return useMutation({
    mutationFn: (input: EvalCaseRunInput) => api.post<EvalCaseRunResult>(`/agents/${agentId}/eval-cases/run`, input),
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: EvalCasePatch;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) => api.patch<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: evalCaseKey(c.id) });
      return invalidateAgentEval(qc, c.owner_id);
    },
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: evalCaseKey(id) });
      return invalidateAgentEval(qc, agentId);
    },
  });
}

/** Case count shown in the run confirmation (AC-31). Re-read on every confirmation. */
export function useEvalEstimate(agentId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: evalEstimateKey(agentId ?? ""),
    queryFn: () => api.get<EvalRunEstimate>(`/agents/${agentId}/eval-runs/estimate`),
    enabled: !!agentId && enabled,
    staleTime: 0,
  });
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunStarted>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunAllResult>("/eval-runs/all"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: evalDashboardKey });
      for (const r of res.results) qc.invalidateQueries({ queryKey: evalAgentKey(r.agent_id) });
    },
  });
}

export function useEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalRunsKey(agentId ?? ""),
    queryFn: () => api.get<EvalRunRecord[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/** One run with its per-case outcomes. Polls every 3 s only while `running`; when a
 *  run first shows a terminal status (also on the very first fetch) it invalidates the agent's
 *  cases, runs and detail queries (AC-32). Keeps the last data on a failed poll. */
export function useEvalRun(id: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: evalRunKey(id ?? ""),
    queryFn: async () => {
      const prev = qc.getQueryData<EvalRunDetail>(evalRunKey(id ?? ""));
      const run = await api.get<EvalRunDetail>(`/eval-runs/${id}`);
      // First terminal sighting: either running -> terminal, or no cached data yet
      // (run already finished before the first poll / remount). Later refetches of a
      // terminal run see a terminal `prev` and do not invalidate again.
      if (run.status !== "running" && (prev === undefined || prev.status === "running")) {
        void invalidateAgentEval(qc, run.agent_id);
      }
      return run;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "running" ? EVAL_RUN_POLL_MS : false),
  });
}

export function useEvalAgentDetail(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalAgentKey(agentId ?? ""),
    queryFn: () => api.get<EvalAgentDetail>(`/eval/agents/${agentId}`),
    enabled: !!agentId,
  });
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: evalDashboardKey,
    queryFn: () => api.get<EvalDashboard>("/eval/dashboard"),
  });
}

/** Compare two runs of one agent (`a` = older, `b` = newer). */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", a, b] as const,
    queryFn: () => api.get<EvalCompare>(`/eval-runs/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
  });
}
