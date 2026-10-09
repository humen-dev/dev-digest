import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { RunsTable } from "./RunsTable";

afterEach(cleanup);

function run(over: Partial<EvalRunRecord> & { id: string }): EvalRunRecord {
  return {
    agent_id: "ag1",
    agent_name: "Security",
    agent_version: 1,
    skills_fingerprint: [],
    skills_delta: false,
    status: "completed",
    error_reason: null,
    started_at: "2026-10-09T10:05:00.000Z",
    finished_at: "2026-10-09T10:06:00.000Z",
    duration_ms: 60000,
    cost_usd: 0.014,
    case_ids: [],
    metrics: {
      recall: 0.8,
      precision: 0.5,
      citation_accuracy: 1,
      cases_passed: 4,
      cases_total: 5,
      cases_errored: 0,
      uncovered_findings: 0,
    },
    ...over,
  };
}

const RUNS: EvalRunRecord[] = [
  run({ id: "r3", agent_version: 3, skills_delta: true }),
  run({ id: "r2", agent_version: 2, cost_usd: null, metrics: null, status: "errored" }),
  run({ id: "r1", agent_version: 1, status: "running", metrics: null }),
];

function renderTable(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunsTable", () => {
  it("lists runs in the given order with text for version, passed, cost and status", () => {
    renderTable(<RunsTable runs={RUNS} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("v3 · skills Δ")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("4 / 5 passing")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.014")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("completed")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2026-10-09 10:05")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("v2")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("—")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("errored")).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText("n/a").length).toBeGreaterThanOrEqual(3);
    expect(within(rows[2]!).getByText("running")).toBeInTheDocument();
  });

  it("reports the selection through onSelectionChange when selectable", () => {
    const onSelectionChange = vi.fn();
    renderTable(<RunsTable runs={RUNS} selectable onSelectionChange={onSelectionChange} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[2]!);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["r3", "r1"]);
    fireEvent.click(boxes[0]!);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["r1"]);
  });

  it("adds an agent-name column only with showAgent", () => {
    renderTable(<RunsTable runs={[run({ id: "x", agent_name: "Perf" })]} />);
    expect(screen.queryByRole("columnheader", { name: "Agent" })).not.toBeInTheDocument();
    cleanup();
    renderTable(<RunsTable runs={[run({ id: "x", agent_name: "Perf" })]} showAgent />);
    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    expect(within(screen.getAllByRole("row")[1]!).getByText("Perf")).toBeInTheDocument();
  });
});
