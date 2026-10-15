import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";

let SEARCH = "range=30d";
let QUERY: { data: AgentPerf | undefined; isLoading: boolean } = { data: undefined, isLoading: true };
const refetch = vi.fn();
const routerReplace = vi.fn();

vi.mock("@/lib/hooks/agent-performance", () => ({
  useAgentPerformance: () => ({ ...QUERY, refetch }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH),
  usePathname: () => "/agent-performance",
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

const PERIOD = { from: "2026-09-15T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" };

function agent(id: string | null, name: string, o: Partial<AgentPerfRow> = {}): AgentPerfRow {
  return {
    agent_id: id,
    agent_name: name,
    enabled: id == null ? null : true,
    runs: 58,
    unpriced_runs: 0,
    total_cost_usd: 1.5,
    avg_cost_usd: 0.026,
    avg_duration_ms: 6200,
    accepted: 45,
    dismissed: 13,
    pending: 0,
    decided: 58,
    accept_rate: 45 / 58,
    prev_accept_rate: 0.7,
    prev_decided: 10,
    last_run_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    recent_runs: [
      { run_id: "r1", ran_at: new Date().toISOString(), status: "done", source: "ci", duration_ms: 3000, cost_usd: 0.01 },
    ],
    ...o,
  };
}

function perf(o: Partial<AgentPerf> = {}): AgentPerf {
  return {
    period: PERIOD,
    previous_period: PERIOD,
    summary: {
      runs: 142,
      total_cost_usd: 3.2,
      prev_total_cost_usd: 4.4,
      unpriced_runs: 2,
      priced_ci_runs: 1,
      avg_accept_rate: 0.78,
      accepted: 45,
      decided: 58,
      most_active: { agent_id: "a1", agent_name: "Security Reviewer", runs: 142, accept_rate: 0.78 },
    },
    run_buckets: { size: "day", buckets: [{ start: "2026-10-14T00:00:00Z", runs: 4 }, { start: "2026-10-15T00:00:00Z", runs: 9 }] },
    agents: [
      agent("a1", "Security Reviewer"),
      agent("a2", "<b>x</b>", { enabled: false, runs: 12, decided: 3, accepted: 2, accept_rate: 2 / 3 }),
      agent("a3", "Idle", { runs: 0, decided: 0, accept_rate: null, avg_cost_usd: null, avg_duration_ms: null, last_run_at: null, recent_runs: [] }),
      agent(null, "Unknown agent", { runs: 5, decided: 0, accept_rate: null }),
    ],
    cost_by_agent: [{ key: "a1", label: "Security Reviewer", value: 2 }],
    cost_by_model: [{ key: "<i>m</i>", label: "<i>m</i>", value: 3.2 }],
    ...o,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <AgentPerformanceView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  SEARCH = "range=30d";
  QUERY = { data: undefined, isLoading: true };
  routerReplace.mockClear();
  refetch.mockClear();
});
afterEach(cleanup);

describe("AgentPerformanceView — data state", () => {
  it("shows KPIs, a sortable table, expandable rows and the cost breakdown", () => {
    QUERY = { data: perf(), isLoading: false };
    renderView();

    expect(screen.getByRole("heading", { name: "Agent Performance" })).toBeInTheDocument();
    expect(screen.getAllByTestId("kpi-card")).toHaveLength(4);
    expect(screen.getByText("Total runs · 30d")).toBeInTheDocument();
    expect(screen.getByText("142 runs · 78% accept")).toBeInTheDocument();
    expect(screen.getByText("−$1.200 vs previous period")).toBeInTheDocument();
    expect(screen.getByText("2 runs without a reported cost are not included")).toBeInTheDocument();
    expect(screen.getAllByText("Provider-reported, not reconciled with billing")).toHaveLength(2);

    // default sort: accept rate descending
    expect(screen.getByRole("columnheader", { name: /Accept rate/ })).toHaveAttribute("aria-sort", "descending");
    const table = screen.getByRole("table");
    expect(within(table).getByText("78% · 45/58")).toBeInTheDocument();
    expect(within(table).getByRole("img", { name: "up from 70%" })).toBeInTheDocument();
    expect(within(table).getAllByText("6.2s", { selector: "td" }).length).toBeGreaterThan(0);
  });

  it("writes the sort to the URL, links View with the period, dims empty rows and renders names literally", () => {
    QUERY = { data: perf(), isLoading: false };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Runs" }));
    expect(routerReplace).toHaveBeenCalledWith(expect.stringContaining("sort=runs&dir=desc"));

    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Small sample (n=3)")).toBeInTheDocument();
    const views = screen.getAllByRole("link", { name: "View" });
    expect(views).toHaveLength(3);
    expect(views[0]!.getAttribute("href")).toContain("tab=stats&range=30d");
    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
    expect(screen.getByText("<i>m</i>")).toBeInTheDocument();

    const expand = screen.getByRole("button", { name: "Show latest runs for Security Reviewer" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Done")).toBeInTheDocument();
    fireEvent.click(expand);
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("restores the sort from the URL and ignores junk", () => {
    SEARCH = "range=30d&sort=<img src=x onerror=alert(1)>&dir=asc";
    QUERY = { data: perf(), isLoading: false };
    const { container } = renderView();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Accept rate/ })).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("AgentPerformanceView — other states", () => {
  it("shows placeholders only while loading", () => {
    renderView();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByTestId("kpi-card")).toHaveLength(4);
    expect(document.querySelectorAll(".tnum")).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Cost breakdown" }).textContent).not.toMatch(/\d|\$/);
  });

  it("shows a message and Retry when the request fails, and no numbers", () => {
    QUERY = { data: undefined, isLoading: false };
    renderView();
    expect(screen.getByText("Could not load agent performance.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByTestId("kpi-card")).toHaveLength(0);
  });

  it("shows the empty state with a Pull Requests link when no run is counted", () => {
    QUERY = { data: perf({ summary: { ...perf().summary, runs: 0 }, agents: [] }), isLoading: false };
    renderView();
    expect(screen.getByText("No agent runs in this period")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Pull Requests" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("explains a period with runs but no reported cost or decisions", () => {
    QUERY = {
      data: perf({
        summary: { ...perf().summary, total_cost_usd: null, prev_total_cost_usd: null, decided: 0, accepted: 0, avg_accept_rate: null },
        cost_by_agent: [],
        cost_by_model: [],
      }),
      isLoading: false,
    };
    renderView();
    expect(screen.getByText("No reported cost in this period")).toBeInTheDocument();
    expect(screen.getByText("0 decisions")).toBeInTheDocument();
  });
});
