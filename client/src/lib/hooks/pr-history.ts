/* hooks/pr-history.ts — React Query hook for the prior-PR history of a PR
   (GET /pulls/:id/history). Read-only; never triggers a model call. The server
   caches per head SHA, so the client keeps the answer fresh for a few minutes
   and does not retry (an unavailable answer is a normal 200, not an error). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistoryResponse } from "@devdigest/shared";

const PR_HISTORY_STALE_MS = 5 * 60 * 1000;

export const prHistoryKey = (prId: string) => ["pr-history", prId] as const;

/** Merged PRs that touched the files this PR changes. */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: prHistoryKey(prId ?? ""),
    queryFn: () => api.get<PrHistoryResponse>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: PR_HISTORY_STALE_MS,
    retry: false,
  });
}
