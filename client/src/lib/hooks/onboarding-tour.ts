/* hooks/onboarding-tour.ts — React Query hooks over the onboarding tour API:
     GET  /repos/:id/tour          → OnboardingTourState
     POST /repos/:id/tour/generate → OnboardingTour (synchronous, SPEC-03 AC-31)
   On success the generated tour is merged straight into the GET's cache
   entry (no extra round trip, AC-36). On ANY POST error — not just 409 — the
   GET is invalidated/refetched instead of trusting the mutation's own
   error: a 504 `generation_timeout` (or any other failure reported to the
   browser) does not mean the server-side generation actually stopped, and
   the GET is the only source of truth for `generating` (AC-32, EC-8, M-3).
   While the refetched state still reports `generating: true`, poll it on a
   modest interval so the page returns to Regenerate on its own once the
   server-side run finishes — mirrors hooks/reviews.ts' `refetchInterval`
   pattern for in-flight work. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { api } from "../api";

/** Poll interval while the server reports a generation in flight (ms). */
const GENERATING_POLL_MS = 4000;

function tourQueryKey(repoId: string | null | undefined) {
  return ["onboarding-tour", repoId] as const;
}

/** GET /repos/:id/tour → the repository's tour state (tour, staleness, clone
 *  and index readiness, in-flight flag). Polls while `generating` is true so
 *  a long-running generation (started here or still finishing after a client
 *  timeout) surfaces its completion without a manual refresh. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: tourQueryKey(repoId),
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.generating ? GENERATING_POLL_MS : false),
  });
}

/** POST /repos/:id/tour/generate → runs synchronously and returns the stored
 *  tour (AC-31). On any error — a 409 because a generation is already in
 *  flight (EC-7), a 504 timeout whose generation may still be running
 *  server-side, or anything else — re-fetch the GET rather than merging a
 *  tour we never received; the GET's `generating` flag is what the UI
 *  trusts (AC-32). */
export function useGenerateTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTour>(`/repos/${repoId}/tour/generate`),
    onSuccess: (tour) => {
      qc.setQueryData<OnboardingTourState | undefined>(tourQueryKey(repoId), (prev) => ({
        tour,
        cloned: prev?.cloned ?? true,
        index_status: prev?.index_status ?? null,
        generating: false,
        stale: false,
        current_commit: tour.tour_commit,
      }));
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: tourQueryKey(repoId) });
    },
  });
}
