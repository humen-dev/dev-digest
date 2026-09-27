/* hooks/intent.ts — React Query hooks for the PR Intent layer
   (GET/POST /pulls/:id/intent). Hooks call `api` directly (no useApiQuery layer
   — see client/INSIGHTS.md). GET never triggers a model call; POST does, so it
   is a mutation. Mutation errors are toasted once by the global MutationCache
   (providers.tsx) — IntentCard additionally renders them inline (e.g. a link to
   Settings on `model_not_configured`). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentState } from "@devdigest/shared";

const intentKey = (prId: string) => ["pr-intent", prId] as const;

/** Stored intent + staleness for a PR. Read-only — never calls a model. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKey(prId ?? ""),
    queryFn: () => api.get<PrIntentState>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Detect / Re-detect: classifies synchronously and replaces the cached state. */
export function useDetectIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentState>(`/pulls/${prId}/intent`),
    onSuccess: (state) => {
      if (prId) qc.setQueryData(intentKey(prId), state);
    },
  });
}
