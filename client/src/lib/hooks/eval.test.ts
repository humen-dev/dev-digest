import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalRunDetail } from "@devdigest/shared";
import { api } from "../api";
import {
  EVAL_RUN_POLL_MS,
  evalAgentKey,
  evalCasesKey,
  evalDashboardKey,
  evalRunKey,
  evalRunsKey,
  useCreateEvalCaseFromFinding,
  useEvalCases,
  useEvalRun,
} from "./eval";

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

function run(status: EvalRunDetail["status"]): EvalRunDetail {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_name: "Security",
    agent_version: 3,
    skills_fingerprint: [],
    skills_delta: false,
    status,
    error_reason: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: status === "running" ? null : "2026-10-09T10:01:00.000Z",
    duration_ms: null,
    cost_usd: null,
    case_ids: ["c1"],
    metrics: null,
    per_case: [],
  };
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEvalCases", () => {
  it("GETs the agent's cases", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result } = renderHook(() => useEvalCases("ag1"), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/agents/ag1/eval-cases");
  });
});

describe("useCreateEvalCaseFromFinding", () => {
  it("POSTs the finding route and refreshes the owner's case list", async () => {
    const created = { id: "c9", owner_id: "ag1" } as EvalCase;
    vi.mocked(api.post).mockResolvedValue(created);
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCaseFromFinding(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      await result.current.mutateAsync("f1");
    });

    expect(api.post).toHaveBeenCalledWith("/findings/f1/eval-case");
    expect(spy).toHaveBeenCalledWith({ queryKey: evalCasesKey("ag1") });
  });
});

describe("useEvalRun", () => {
  it("re-GETs every 3 s while running and stops after completed — AC-32", async () => {
    vi.useFakeTimers();
    vi.mocked(api.get)
      .mockResolvedValueOnce(run("running"))
      .mockResolvedValueOnce(run("running"))
      .mockResolvedValue(run("completed"));
    const qc = makeClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useEvalRun("run1"), { wrapper: wrapperFor(qc) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/eval-runs/run1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData<EvalRunDetail>(evalRunKey("run1"))?.status).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS);
    });
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(qc.getQueryData<EvalRunDetail>(evalRunKey("run1"))?.status).toBe("completed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalCasesKey("ag1") });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 3);
    });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it.each(["completed", "errored"] as const)(
    "invalidates the agent queries when the first GET is already %s, without looping",
    async (status) => {
      vi.mocked(api.get).mockResolvedValue(run(status));
      const qc = makeClient();
      const invalidate = vi.spyOn(qc, "invalidateQueries");
      const { result } = renderHook(() => useEvalRun("run1"), { wrapper: wrapperFor(qc) });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: evalAgentKey("ag1") }));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: evalDashboardKey });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: evalRunsKey("ag1") });
      const calls = invalidate.mock.calls.length;

      await act(async () => {
        await result.current.refetch();
      });
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(invalidate.mock.calls.length).toBe(calls);
    },
  );
});
