import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BriefPage } from "@devdigest/shared";
import { api } from "../api";
import { briefKey, useBriefContextCandidates, useGenerateBrief, usePrBrief } from "./brief";

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

const PROVENANCE = {
  head_sha: "a1b2c3d",
  generated_at: "2026-10-07T10:00:00.000Z",
  provider: "openai",
  model: "gpt-4.1",
  attempts: 1,
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: null,
  context_docs: [],
  dropped_inputs: [],
  missing_sources: [],
};
const BRIEF = { summary: "S", risks: [], review_focus: [] };

function page(over: Partial<BriefPage>): BriefPage {
  return { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "a1b2c3d", ...over };
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe("usePrBrief", () => {
  it("polls every 2 s while generating and stops once the server reports a stored brief — AC-69", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(page({ status: "generating" }))
      .mockResolvedValueOnce(page({ status: "generating" }))
      .mockResolvedValueOnce(page({ status: "generated", brief: BRIEF, provenance: PROVENANCE }));

    const qc = makeClient();
    const cache = () => qc.getQueryData<BriefPage>(briefKey("pr1"));
    vi.useFakeTimers();
    try {
      renderHook(() => usePrBrief("pr1"), { wrapper: wrapperFor(qc) });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith("/pulls/pr1/brief");
      expect(cache()?.status).toBe("generating");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(api.get).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(api.get).toHaveBeenCalledTimes(3);
      expect(cache()?.status).toBe("generated");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(api.get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useGenerateBrief", () => {
  it("replaces the cached page on generated and keeps it on refused / failed — EC-2, EC-5", async () => {
    const qc = makeClient();
    const stored = page({ status: "generated", brief: BRIEF, provenance: PROVENANCE });
    qc.setQueryData(briefKey("pr1"), stored);
    const { result } = renderHook(() => useGenerateBrief("pr1"), { wrapper: wrapperFor(qc) });

    vi.mocked(api.post).mockResolvedValueOnce(page({ status: "refused", reason: "over_budget" }));
    let outcome: BriefPage | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ regenerate: true });
    });
    expect(api.post).toHaveBeenCalledWith("/pulls/pr1/brief", { regenerate: true });
    expect(qc.getQueryData(briefKey("pr1"))).toBe(stored);
    expect(outcome?.status).toBe("refused");
    await waitFor(() => expect(result.current.data?.status).toBe("refused"));

    vi.mocked(api.post).mockResolvedValueOnce(page({ status: "failed", reason: "timeout" }));
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(qc.getQueryData(briefKey("pr1"))).toBe(stored);

    const fresh = page({ status: "outdated", brief: { ...BRIEF, summary: "new" }, provenance: PROVENANCE });
    vi.mocked(api.post).mockResolvedValueOnce(fresh);
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(qc.getQueryData(briefKey("pr1"))).toEqual(fresh);
  });
});

describe("useBriefContextCandidates", () => {
  it("fetches only once enabled", async () => {
    vi.mocked(api.get).mockResolvedValue({ cloned: true, candidates: [] });
    const qc = makeClient();
    const { result, rerender } = renderHook(({ on }) => useBriefContextCandidates("pr1", on), {
      wrapper: wrapperFor(qc),
      initialProps: { on: false },
    });
    expect(api.get).not.toHaveBeenCalled();

    rerender({ on: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/pulls/pr1/brief/context-candidates");
  });
});
