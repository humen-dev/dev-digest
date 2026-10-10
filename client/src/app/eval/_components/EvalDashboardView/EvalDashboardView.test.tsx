import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentSummary, EvalRunAllResult, EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import common from "../../../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function run(id: string, agentId: string): EvalRunRecord {
  return {
    id,
    agent_id: agentId,
    agent_name: agentId,
    agent_version: 2,
    skills_fingerprint: [],
    skills_delta: false,
    status: "completed",
    error_reason: null,
    started_at: "2026-10-09T10:05:00.000Z",
    finished_at: "2026-10-09T10:06:00.000Z",
    duration_ms: 1000,
    cost_usd: 0.01,
    case_ids: [],
    metrics: {
      recall: 0.8,
      precision: 0.6,
      citation_accuracy: 1,
      cases_passed: 4,
      cases_total: 5,
      cases_errored: 0,
      uncovered_findings: 0,
    },
  };
}

function agent(id: string, name: string, cases: number): EvalAgentSummary {
  return { agent_id: id, agent_name: name, model: "gpt-x", cases_total: cases, latest: run(`r-${id}`, id),
    trend: [
      { run_id: `t1-${id}`, ran_at: "2026-10-08T09:00:00.000Z", agent_version: 1, recall: 0.5, precision: 0.5, citation_accuracy: 1, cases_passed: 2, cases_total: 4 },
      { run_id: `t2-${id}`, ran_at: "2026-10-09T10:05:00.000Z", agent_version: 2, recall: 0.8, precision: 0.6, citation_accuracy: 1, cases_passed: 4, cases_total: 5 },
    ],
  };
}

let dashboard: EvalDashboard;
const mutate = vi.fn();
const reset = vi.fn();
let runAllData: EvalRunAllResult | undefined;
let runAllPending = false;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({ data: dashboard, isError: false, refetch: vi.fn() }),
  useRunAllEvals: () => ({ mutate, reset, isPending: runAllPending, isError: false, data: runAllData }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

function setup() {
  dashboard = {
    agents: [agent("a1", "Security", 10), agent("a2", "Style", 8), agent("a3", "Perf", 8)],
    recent_runs: Array.from({ length: 25 }, (_, i) => ({ ...run(`rr${i}`, "a1"), agent_name: "Security" })),
  };
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages, common }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  push.mockClear();
  mutate.mockClear();
  reset.mockClear();
  runAllData = undefined;
  runAllPending = false;
});

describe("EvalDashboardView", () => {
  it("lists agents and at most 20 recent runs, states it is not a ranking, and confirms before Run all", () => {
    setup();
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]!).getAllByRole("row").slice(1)).toHaveLength(3);
    expect(within(screen.getAllByRole("table")[2]!).getAllByRole("row").slice(1)).toHaveLength(20);
    expect(screen.getByText(/They are not a ranking/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("3 agents · 26 executions")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run all agents" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows the agent name per recent run and a hidden table equivalent of the sparklines", () => {
    const { container } = setup();
    const recentTable = screen.getAllByRole("table")[2]!;
    expect(within(recentTable).getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    for (const row of within(recentTable).getAllByRole("row").slice(1)) {
      expect(within(row).getByText("Security")).toBeInTheDocument();
    }
    for (const wrap of screen.getAllByTestId("trend-sparkline")) expect(wrap).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg[aria-hidden='true'], [aria-hidden='true'] svg")).not.toBeNull();
    const trend = screen.getByRole("table", { name: "Trend as a table" });
    expect(within(trend).getAllByRole("row")).toHaveLength(1 + 3 * 2);
    expect(within(trend).getAllByText("50%")).toHaveLength(3);
    expect(within(trend).getAllByText("80%")).toHaveLength(3);
  });

  it("makes each recent run a keyboard-reachable link to the agent page", () => {
    setup();
    const recentTable = screen.getAllByRole("table")[2]!;
    const links = within(recentTable).getAllByRole("link");
    expect(links).toHaveLength(20);
    expect(links[0]).toHaveAttribute("href", "/eval/agents/a1");
  });

  it("keeps the dialog open and Cancel disabled while the Run all request is pending", () => {
    runAllPending = true;
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent("running");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it("renders Run all refusals with the values from details, generic when they are missing", () => {
    runAllData = {
      results: [
        { agent_id: "a1", agent_name: "Security", outcome: "refused", run_id: null, reason: "provider_key_missing", details: { provider: "openai" } },
        { agent_id: "a2", agent_name: "Style", outcome: "refused", run_id: null, reason: "too_many_cases", details: { count: 60, limit: 50 } },
        { agent_id: "a3", agent_name: "Perf", outcome: "refused", run_id: null, reason: "provider_key_missing", details: null },
      ],
    };
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/No API key is configured for openai/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Too many cases: 60/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Something went wrong. Try again./)).toBeInTheDocument();
  });
});
