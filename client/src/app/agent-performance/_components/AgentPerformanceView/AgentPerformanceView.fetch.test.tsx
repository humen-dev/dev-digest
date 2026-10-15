import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerf } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";

/** Real `useAgentPerformance` + `api` over a recorded `fetch` mock (SPEC-09 AC-62..68). */
let SEARCH = "range=30d";
const routerReplace = vi.fn((url: string) => {
  SEARCH = url.split("?")[1] ?? "";
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH),
  usePathname: () => "/agent-performance",
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

const PERIOD = { from: "2026-09-15T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" };

function row(id: string, name: string, runs: number) {
  return {
    agent_id: id,
    agent_name: name,
    enabled: true,
    runs,
    unpriced_runs: 0,
    total_cost_usd: 1,
    avg_cost_usd: 0.5,
    avg_duration_ms: 2000,
    accepted: 6,
    dismissed: 0,
    pending: 0,
    decided: 6,
    accept_rate: 1,
    prev_accept_rate: null,
    prev_decided: 0,
    last_run_at: new Date().toISOString(),
    recent_runs: [],
  };
}

const PERF: AgentPerf = {
  period: PERIOD,
  previous_period: PERIOD,
  summary: {
    runs: 77,
    total_cost_usd: 2,
    prev_total_cost_usd: 1,
    unpriced_runs: 0,
    priced_ci_runs: 0,
    avg_accept_rate: 1,
    accepted: 12,
    decided: 12,
    most_active: { agent_id: "a1", agent_name: "Alpha", runs: 50, accept_rate: 1 },
  },
  run_buckets: { size: "day", buckets: [{ start: "2026-10-15T00:00:00Z", runs: 77 }] },
  agents: [row("a1", "Alpha", 50), row("a2", "Beta", 27)],
  cost_by_agent: [{ key: "a1", label: "Alpha", value: 2 }],
  cost_by_model: [{ key: "m", label: "m", value: 2 }],
};

const calls: { method: string; url: string }[] = [];
type Handler = () => Promise<Response>;
let handlers: Handler[] = [];

const okResponse = (): Promise<Response> =>
  Promise.resolve({ ok: true, status: 200, json: async () => PERF } as unknown as Response);
const failResponse = (): Promise<Response> =>
  Promise.resolve({
    ok: false,
    status: 500,
    statusText: "Server Error",
    json: async () => ({}),
  } as unknown as Response);
const pending = (): Promise<Response> => new Promise(() => {});

function ui(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(ui(client));
  return { rerender: () => view.rerender(ui(client)) };
}

beforeEach(() => {
  SEARCH = "range=30d";
  calls.length = 0;
  handlers = [];
  routerReplace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      const h = handlers.shift() ?? okResponse;
      return h();
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AgentPerformanceView — network behaviour (real hook)", () => {
  it("issues only GETs to /agents/performance across load, sort, expand and a period change (AC-67, AC-68)", async () => {
    const { rerender } = setup();
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Runs" }));
    rerender();
    fireEvent.click(screen.getByRole("button", { name: "Show latest runs for Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    rerender();
    await screen.findByRole("table");

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(calls.map((c) => c.method))).toEqual(new Set(["GET"]));
    for (const c of calls) expect(c.url).toContain("/agents/performance?from=");
    expect(calls[0]!.url).not.toBe(calls[calls.length - 1]!.url);
  });

  it("shows no digits on a rejected fetch and Retry repeats the identical GET (AC-63, AC-64)", async () => {
    handlers = [failResponse];
    setup();
    await screen.findByText("Could not load agent performance.");
    expect(screen.queryAllByTestId("kpi-card")).toHaveLength(0);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toMatch(/\d/);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("table");

    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[1]!.method).toBe("GET");
  });

  it("shows placeholders only while a fetch is pending, also after a period change (AC-62, AC-66)", async () => {
    handlers = [okResponse, pending];
    const { rerender } = setup();
    await screen.findByRole("table");
    expect(screen.getAllByText("77").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    rerender();

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("77")).toBeNull();
    expect(document.querySelectorAll(".tnum")).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Cost breakdown" }).textContent).not.toMatch(/\d|\$/);
  });

  it("starts with placeholders and no digits while the first fetch is pending (AC-62)", async () => {
    handlers = [pending];
    const { rerender } = setup();
    await waitFor(() => expect(calls).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    rerender();

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelectorAll(".tnum")).toHaveLength(0);
  });
});
