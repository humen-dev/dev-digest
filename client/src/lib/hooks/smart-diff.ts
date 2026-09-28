/* hooks/smart-diff.ts — React Query hook for the Smart Diff grouping
   (GET /pulls/:id/smart-diff). Hooks call `api` directly (no useApiQuery layer
   — see client/INSIGHTS.md). Read-only; never triggers a model call. Overlay
   data (dots/counters/cards) comes from usePrReviews instead — see DiffTab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Query key for a PR's smart-diff grouping — exported so callers can read the cache shape. */
export const smartDiffKey = (prId: string) => ["smart-diff", prId] as const;

/** Files grouped by reviewer role (core/tests/wiring/docs/boilerplate) for a PR. */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: smartDiffKey(prId ?? ""),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
