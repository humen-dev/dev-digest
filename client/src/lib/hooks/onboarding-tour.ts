/* hooks/onboarding-tour.ts — React Query hooks over the onboarding tour API:
     GET  /repos/:id/tour          → OnboardingTourState
     POST /repos/:id/tour/generate → OnboardingTour (synchronous, SPEC-03 AC-31)
   On success the generated tour is merged straight into the GET's cache
   entry (no extra round trip, AC-36); on 409 (another generation already in
   flight, EC-7/EC-8) the GET is invalidated instead so the next read reports
   `generating: true`. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { api, ApiError } from "../api";

function tourQueryKey(repoId: string | null | undefined) {
  return ["onboarding-tour", repoId] as const;
}

/** GET /repos/:id/tour → the repository's tour state (tour, staleness, clone
 *  and index readiness, in-flight flag). */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: tourQueryKey(repoId),
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
  });
}

/** POST /repos/:id/tour/generate → runs synchronously and returns the stored
 *  tour (AC-31). A 409 means a generation is already in flight for this
 *  repository (EC-7) — re-fetch the GET rather than merging a tour we never
 *  received. */
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
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        qc.invalidateQueries({ queryKey: tourQueryKey(repoId) });
      }
    },
  });
}
