/* hooks/brief.ts — React Query hooks for the PR Brief (SPEC-04):
   GET/POST /pulls/:id/brief and GET /pulls/:id/brief/context-candidates.
   GET never calls a model (reopening a stored brief is free); POST does, so it is
   a mutation. Hooks call `api` directly (no useApiQuery layer — client/INSIGHTS.md). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BriefContextCandidates, BriefPage, GenerateBriefBody } from "@devdigest/shared";

/** How often the stored brief is re-read while a generation is in flight. */
export const BRIEF_POLL_MS = 2_000;

/** Query key for a PR's brief — exported so callers invalidate through the owning hook module. */
export const briefKey = (prId: string) => ["pr-brief", prId] as const;
const candidatesKey = (prId: string) => ["pr-brief-candidates", prId] as const;

/** Stored brief + status for a PR. Polls every 2 s while the server reports `generating`. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId ?? ""),
    queryFn: () => api.get<BriefPage>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? BRIEF_POLL_MS : false),
  });
}

/** Generate / Regenerate. Stored outcomes replace the cache; `refused` / `failed` keep
 *  the previous brief and are exposed through the mutation result (`data`) for the caller. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateBriefBody = {}) => api.post<BriefPage>(`/pulls/${prId}/brief`, body),
    onSuccess: (page) => {
      if (!prId) return;
      if (page.status === "generated" || page.status === "outdated" || page.status === "generating") {
        qc.setQueryData(briefKey(prId), page);
      }
    },
  });
}

/** Context-document candidates for the picker — fetched only once the picker opens. */
export function useBriefContextCandidates(prId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: candidatesKey(prId ?? ""),
    queryFn: () => api.get<BriefContextCandidates>(`/pulls/${prId}/brief/context-candidates`),
    enabled: !!prId && enabled,
    staleTime: 0,
  });
}
