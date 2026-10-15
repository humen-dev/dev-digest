import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats } from "@devdigest/shared";
import perfMessages from "../../../../../../../../messages/en/agentPerformance.json";

let search = "";
const hookResult = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const useAgentStatsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/agents/ag1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agent-performance", () => ({
  useAgentStats: (...args: unknown[]) => {
    useAgentStatsMock(...args);
    return hookResult.current;
  },
}));

import { StatsTab } from "./StatsTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  period: { from: "2026-09-15T00:00:00Z", to: "2026-10-15T00:00:00Z" },
  previous_period: { from: "2026-08-15T00:00:00Z", to: "2026-09-15T00:00:00Z" },
  runs: 12,
  unpriced_runs: 2,
  avg_cost_usd: 0.05,
  prev_avg_cost_usd: 0.0625,
  avg_duration_ms: 6200,
  accepted: 3,
  dismissed: 1,
  pending: 0,
  decided: 4,
  accept_rate: 0.75,
  run_buckets: { size: "day", buckets: [{ start: "2026-10-14T00:00:00Z", runs: 5 }, { start: "2026-10-15T00:00:00Z", runs: 7 }] },
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: perfMessages }}>
      <StatsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  search = "";
  useAgentStatsMock.mockClear();
});
afterEach(cleanup);

describe("StatsTab", () => {
  it("shows the four KPIs with honest-cost notes and a small-sample badge", () => {
    hookResult.current = { data: STATS, isPending: false, refetch: vi.fn() };
    renderTab();

    expect(screen.getByText("Total runs · 30d")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("$0.050")).toBeInTheDocument();
    expect(screen.getByText("6.2s")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3 / 4 decisions")).toBeInTheDocument();
    expect(screen.getByText("Provider-reported, not reconciled with billing")).toBeInTheDocument();
    expect(screen.getByText("2 runs without a reported cost are not included")).toBeInTheDocument();
    expect(screen.getByText("−$0.012 vs previous period")).toBeInTheDocument();
    expect(screen.getByText("Small sample (n=4)")).toBeInTheDocument();
  });

  it("selects the period from a dashboard View link and queries it", () => {
    search = "range=custom&from=2026-10-01&to=2026-10-10";
    hookResult.current = { data: STATS, isPending: false, refetch: vi.fn() };
    renderTab();

    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "true");
    const [id, period] = useAgentStatsMock.mock.calls[0]!;
    expect(id).toBe("ag1");
    expect(period.from).toMatch(/^2026-10-01T/);
  });

  it("shows no digits while pending", () => {
    hookResult.current = { data: undefined, isPending: true, refetch: vi.fn() };
    renderTab();

    expect(screen.getAllByTestId("kpi-card")).toHaveLength(4);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("No runs in this period")).not.toBeInTheDocument();
  });

  it("shows an error with Retry, not 'No runs', when the request failed", () => {
    const refetch = vi.fn();
    hookResult.current = { data: undefined, isPending: false, refetch };
    renderTab();

    expect(screen.getByText("Could not load agent stats.")).toBeInTheDocument();
    expect(screen.queryByText("No runs in this period")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows text and dashes when there were no runs", () => {
    hookResult.current = {
      data: { ...STATS, runs: 0, unpriced_runs: 0, avg_cost_usd: null, prev_avg_cost_usd: null, avg_duration_ms: null, decided: 0, accepted: 0, accept_rate: null },
      isPending: false,
      refetch: vi.fn(),
    };
    renderTab();

    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
