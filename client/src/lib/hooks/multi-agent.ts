/* hooks/multi-agent.ts — React Query hooks for SPEC-07 Multi-Agent Review. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { rememberSelection } from "../multi-agent-selection";
import type { MultiAgentRun, MultiAgentRunRef, MultiAgentRunTriggerResult } from "@devdigest/shared";

const POLL_MS = 4000;

/** The id of the run already in flight, when a start request failed with 409
    `multi_run_in_flight` (`details.multi_run_id`); otherwise null. */
export function inFlightRunId(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const id = (err.details as { multi_run_id?: unknown } | null | undefined)?.multi_run_id;
  return typeof id === "string" ? id : null;
}

/** Start one multi-agent run; remembers the chosen agents for the next pick. */
export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiAgentRunTriggerResult>(`/pulls/${prId}/multi-agent-run`, { agentIds }),
    onSuccess: (_d, { prId, agentIds }) => {
      rememberSelection(agentIds);
      qc.invalidateQueries({ queryKey: ["multi-agent-latest", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent-latest", "workspace"] });
    },
  });
}

/** One multi-agent run (the latest of the PR when `multiRunId` is null). Polls
    while any column is still running. */
export function useMultiAgentRun(prId: string | null, multiRunId: string | null) {
  return useQuery({
    queryKey: ["multi-agent-run", prId, multiRunId],
    queryFn: () =>
      api.get<MultiAgentRun>(
        `/pulls/${prId}/multi-agent${multiRunId ? `?multiRunId=${encodeURIComponent(multiRunId)}` : ""}`,
      ),
    enabled: !!prId,
    refetchInterval: (query) =>
      query.state.data?.columns.some((c) => c.status === "running") ? POLL_MS : false,
  });
}

/** Latest multi-agent run of a PR, or null when it has none. */
export function useLatestMultiAgentRunForPr(prId: string | null) {
  return useQuery({
    queryKey: ["multi-agent-latest", prId],
    queryFn: () => api.get<MultiAgentRunRef | null>(`/pulls/${prId}/multi-agent/latest`),
    enabled: !!prId,
  });
}

/** Latest multi-agent run in the workspace, or null. */
export function useLatestMultiAgentRun() {
  return useQuery({
    queryKey: ["multi-agent-latest", "workspace"],
    queryFn: () => api.get<MultiAgentRunRef | null>("/multi-agent/latest"),
  });
}
