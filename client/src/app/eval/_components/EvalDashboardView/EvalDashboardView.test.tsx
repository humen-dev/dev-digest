import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentSummary, EvalDashboard, EvalRunRecord } from "@devdigest/shared";
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
  return { agent_id: id, agent_name: name, model: "gpt-x", cases_total: cases, latest: run(`r-${id}`, id), trend: [] };
}

let dashboard: EvalDashboard;
const mutate = vi.fn();

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({ data: dashboard, isError: false, refetch: vi.fn() }),
  useRunAllEvals: () => ({ mutate, reset: vi.fn(), isPending: false, isError: false, data: undefined }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

function setup() {
  dashboard = {
    agents: [agent("a1", "Security", 10), agent("a2", "Style", 8), agent("a3", "Perf", 8)],
    recent_runs: Array.from({ length: 25 }, (_, i) => run(`rr${i}`, "a1")),
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
});

describe("EvalDashboardView", () => {
  it("lists agents and at most 20 recent runs, states it is not a ranking, and confirms before Run all", () => {
    setup();
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]!).getAllByRole("row").slice(1)).toHaveLength(3);
    expect(within(tables[1]!).getAllByRole("row").slice(1)).toHaveLength(20);
    expect(screen.getByText(/They are not a ranking/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("3 agents · 26 executions")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run all agents" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
