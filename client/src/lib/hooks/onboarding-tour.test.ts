import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { api, ApiError } from "../api";
import { useGenerateTour, useOnboardingTour } from "./onboarding-tour";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const STATE: OnboardingTourState = {
  tour: null,
  cloned: true,
  index_status: "full",
  generating: false,
  stale: false,
  current_commit: "abc1234",
};

const TOUR: OnboardingTour = {
  repo_id: "repo1",
  tour_commit: "def5678",
  generated_at: new Date().toISOString(),
  tracked_file_count: 10,
  indexed_file_count: 10,
  model: "deepseek/deepseek-v4-flash",
  api_cost_usd: null,
  duration_ms: 1000,
  architecture: { overview: "x", overview_paths: [], diagram: null },
  critical_paths: [],
  how_to_run: [],
  guided_reading: [],
  first_tasks: [],
  counters: {
    critical_paths: { proposed: 0, dropped: 0 },
    how_to_run: { proposed: 0, dropped: 0 },
    guided_reading: { proposed: 0, dropped: 0 },
    first_tasks: { proposed: 0, dropped: 0 },
  },
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe("useOnboardingTour", () => {
  it("GETs the repo's tour state", async () => {
    vi.mocked(api.get).mockResolvedValue(STATE);
    const { result } = renderHook(() => useOnboardingTour("repo1"), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/repos/repo1/tour");
    expect(result.current.data).toEqual(STATE);
  });

  it("keeps the last tour data when a background refetch fails — EC-27", async () => {
    const stateWithTour: OnboardingTourState = { ...STATE, tour: TOUR };
    vi.mocked(api.get).mockResolvedValueOnce(stateWithTour);
    const { result } = renderHook(() => useOnboardingTour("repo1"), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stateWithTour);

    vi.mocked(api.get).mockRejectedValueOnce(new ApiError("provider is down", 500, "external_service_error"));
    await act(async () => {
      try {
        await result.current.refetch();
      } catch {
        /* expected — asserted via isError below */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // The page gates its error view on `!data` (TourView.tsx), not `isError` —
    // this is what keeps the stored tour visible through a failed refetch.
    expect(result.current.data).toEqual(stateWithTour);
  });
});

describe("useGenerateTour", () => {
  it("merges a successful generation into the GET's cache — AC-36", async () => {
    vi.mocked(api.get).mockResolvedValue(STATE);
    vi.mocked(api.post).mockResolvedValue(TOUR);
    const qc = makeClient();
    const wrapper = wrapperFor(qc);

    const getHook = renderHook(() => useOnboardingTour("repo1"), { wrapper });
    await waitFor(() => expect(getHook.result.current.isSuccess).toBe(true));

    const genHook = renderHook(() => useGenerateTour("repo1"), { wrapper });
    await act(async () => {
      await genHook.result.current.mutateAsync();
    });

    expect(api.post).toHaveBeenCalledWith("/repos/repo1/tour/generate");
    expect(qc.getQueryData(["onboarding-tour", "repo1"])).toEqual({
      tour: TOUR,
      cloned: true,
      index_status: "full",
      generating: false,
      stale: false,
      current_commit: TOUR.tour_commit,
    });
  });

  it("invalidates the GET instead of merging on a 409 — EC-7, EC-8", async () => {
    vi.mocked(api.get).mockResolvedValue(STATE);
    vi.mocked(api.post).mockRejectedValue(new ApiError("in progress", 409, "generation_in_progress"));
    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = wrapperFor(qc);

    const genHook = renderHook(() => useGenerateTour("repo1"), { wrapper });
    await act(async () => {
      try {
        await genHook.result.current.mutateAsync();
      } catch {
        /* expected — asserted via the invalidation below */
      }
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["onboarding-tour", "repo1"] });
  });

  it("invalidates the GET on a non-409 error too, since a 504 timeout does not mean the server-side generation stopped — M-3", async () => {
    vi.mocked(api.get).mockResolvedValue(STATE);
    vi.mocked(api.post).mockRejectedValue(new ApiError("generation timed out", 504, "generation_timeout"));
    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = wrapperFor(qc);

    const genHook = renderHook(() => useGenerateTour("repo1"), { wrapper });
    await act(async () => {
      try {
        await genHook.result.current.mutateAsync();
      } catch {
        /* expected — asserted via the invalidation below */
      }
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["onboarding-tour", "repo1"] });
  });
});

describe("useOnboardingTour — polling while generating (M-3)", () => {
  it("polls the GET while a generation is in flight and stops once the server reports it finished", async () => {
    const generatingState: OnboardingTourState = { ...STATE, generating: true };
    const idleState: OnboardingTourState = { ...STATE, tour: TOUR, generating: false };
    vi.mocked(api.get)
      .mockResolvedValueOnce(generatingState)
      .mockResolvedValueOnce(generatingState)
      .mockResolvedValueOnce(idleState);

    // Fake timers from the start — `refetchInterval`'s setTimeout must be
    // scheduled under the same fake clock we later advance, otherwise it is
    // a real timer that `advanceTimersByTimeAsync` can never trigger. Asserting
    // on the query cache (rather than the rendered hook result) sidesteps an
    // unrelated fake-timer/React-scheduler render-lag artifact in this test
    // harness — the cache is exactly what `useOnboardingTour` reads and what
    // the real page re-renders from on a real clock.
    const qc = makeClient();
    const cache = () => qc.getQueryData<OnboardingTourState>(["onboarding-tour", "repo1"]);
    vi.useFakeTimers();
    try {
      renderHook(() => useOnboardingTour("repo1"), { wrapper: wrapperFor(qc) });
      // No real timers involved in the first fetch — just flush microtasks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(cache()?.generating).toBe(true);

      // Still generating after the first poll tick — keeps polling.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(cache()?.generating).toBe(true);

      // The server finished — the next poll reports generating:false and the
      // interval stops (AC-32: the GET's flag decides, not the stale UI state).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(api.get).toHaveBeenCalledTimes(3);
      expect(cache()?.generating).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(api.get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
