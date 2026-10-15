import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAgentPerformance, useAgentStats } from "./agent-performance";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const PERIOD = { from: "2026-10-01T00:00:00.000+03:00", to: "2026-10-15T23:59:59.999+03:00" };

function requestedUrl(): string {
  return String(fetchMock.mock.calls[0]![0]);
}

describe("agent-performance hooks — offset encoding (plan §8)", () => {
  it("sends the +HH:MM offset as %2B on the dashboard request, never a raw + or space", async () => {
    const { result } = renderHook(() => useAgentPerformance(PERIOD), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = requestedUrl();
    expect(url).toContain("/agents/performance?");
    expect(url).toContain("from=2026-10-01T00%3A00%3A00.000%2B03%3A00");
    expect(url).toContain("to=2026-10-15T23%3A59%3A59.999%2B03%3A00");
    expect(url).not.toContain("+");
    expect(url).not.toContain(" ");
  });

  it("encodes the same way on the per-agent stats request", async () => {
    const { result } = renderHook(() => useAgentStats("ag1", PERIOD), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = requestedUrl();
    expect(url).toContain("/agents/ag1/stats?");
    expect(url).toContain("from=2026-10-01T00%3A00%3A00.000%2B03%3A00");
    expect(url).not.toContain("+");
    expect(url).not.toContain(" ");
  });
});
