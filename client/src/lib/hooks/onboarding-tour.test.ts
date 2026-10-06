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
});
