/* hooks/agent-performance.ts — React Query hooks for SPEC-09 Agent Performance (GET only). */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentPerf, AgentStats } from "@devdigest/shared";
import { api } from "../api";

interface Period {
  from: string;
  to: string;
}

/** URLSearchParams encodes `+` in `±HH:MM` offsets (a raw `+` would read as a space). */
function periodQuery(p: Period): string {
  return new URLSearchParams({ from: p.from, to: p.to }).toString();
}

/** Dashboard aggregate. No `placeholderData`: a period change must not show the old period's numbers. */
export function useAgentPerformance(p: Period) {
  return useQuery({
    queryKey: ["agent-performance", p.from, p.to],
    queryFn: () => api.get<AgentPerf>(`/agents/performance?${periodQuery(p)}`),
  });
}

/** One agent's Stats tab. */
export function useAgentStats(agentId: string, p: Period) {
  return useQuery({
    queryKey: ["agent-stats", agentId, p.from, p.to],
    queryFn: () => api.get<AgentStats>(`/agents/${encodeURIComponent(agentId)}/stats?${periodQuery(p)}`),
    enabled: !!agentId,
  });
}
