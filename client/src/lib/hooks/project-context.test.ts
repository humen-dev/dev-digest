import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import {
  useProjectDocs,
  useSetAgentContextDocs,
  agentContextDocsKey,
} from "./project-context";

vi.mock("../api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useProjectDocs", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("refetches on every mount — AC-12", async () => {
    vi.mocked(api.get).mockResolvedValue({ cloned: true, documents: [], total: 0, scanned_at: "now" });
    const qc = makeClient();
    const wrapper = wrapperFor(qc);

    const first = renderHook(() => useProjectDocs("repo1"), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useProjectDocs("repo1"), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("useSetAgentContextDocs", () => {
  beforeEach(() => {
    vi.mocked(api.put).mockReset();
  });

  it("rolls the cache back after a 500 — EC-11", async () => {
    const qc = makeClient();
    const key = agentContextDocsKey("agent1");
    qc.setQueryData(key, { paths: ["README.md"] });
    vi.mocked(api.put).mockRejectedValue(new Error("500"));

    const wrapper = wrapperFor(qc);
    const { result } = renderHook(() => useSetAgentContextDocs("agent1"), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync(["docs/new.md"]);
      } catch {
        /* expected — asserted via cache state below */
      }
    });

    // Optimistic write happened, then onError rolled it back to the snapshot.
    expect(qc.getQueryData(key)).toEqual({ paths: ["README.md"] });
  });
});
