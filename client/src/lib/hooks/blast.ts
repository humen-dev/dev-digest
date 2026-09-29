/* hooks/blast.ts — React Query hook for the PR blast-radius map
   (GET /pulls/:id/blast). Read-only; never triggers a model call. Polling is
   opt-in and only continues while the answer is still degraded, so a resync
   started from the card refreshes it and then stops. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

export const blastKey = (prId: string) => ["blast", prId] as const;

export interface UseBlastRadiusOptions {
  /** Refetch interval while the response is degraded; false/undefined disables polling. */
  pollMs?: number | false;
  /** Epoch ms after which polling stops even if still degraded (bounds a stuck resync). */
  pollUntil?: number;
}

/** Changed symbols, callers, affected endpoints/crons and index health for a PR. */
export function useBlastRadius(prId: string | null | undefined, opts?: UseBlastRadiusOptions) {
  const pollMs = opts?.pollMs ?? false;
  const pollUntil = opts?.pollUntil;
  return useQuery({
    queryKey: blastKey(prId ?? ""),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
    refetchInterval: (query) => {
      if (pollMs === false || !query.state.data?.degraded) return false;
      if (pollUntil !== undefined && Date.now() >= pollUntil) return false;
      return pollMs;
    },
  });
}
