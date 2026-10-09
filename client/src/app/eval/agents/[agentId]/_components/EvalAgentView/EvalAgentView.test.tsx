import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDetail, EvalCompare, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/eval.json";
import common from "../../../../../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function run(id: string, version: number, started: string, recall: number, over: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id,
    agent_id: "ag1",
    agent_name: "Security",
    agent_version: version,
    skills_fingerprint: [],
    skills_delta: false,
    status: "completed",
    error_reason: null,
    started_at: started,
    finished_at: started,
    duration_ms: 1000,
    cost_usd: 0.01,
    case_ids: [],
    metrics: {
      recall,
      precision: 0.5,
      citation_accuracy: 1,
      cases_passed: 3,
      cases_total: 4,
      cases_errored: 0,
      uncovered_findings: 0,
    },
    ...over,
  };
}

const R3 = run("r3", 3, "2026-10-09T12:00:00.000Z", 0.82, { skills_delta: true });
const R2 = run("r2", 2, "2026-10-08T12:00:00.000Z", 0.78);
const R1 = run("r1", 1, "2026-10-07T12:00:00.000Z", 0.7);

let detail: EvalAgentDetail;
let compare: EvalCompare;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalAgentDetail: () => ({ data: detail, isError: false, refetch: vi.fn() }),
  useEvalDashboard: () => ({
    data: {
      agents: [
        { agent_id: "ag1", agent_name: "Security" },
        { agent_id: "ag2", agent_name: "Style" },
      ],
      recent_runs: [],
    },
  }),
  useEvalCompare: () => ({ data: compare, isError: false, error: null }),
  useEvalEstimate: () => ({ data: undefined, isError: false }),
  useEvalRun: () => ({ data: undefined, isError: false }),
  useStartEvalRun: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

import { EvalAgentView } from "./EvalAgentView";

function setup(over: Partial<EvalAgentDetail> = {}) {
  detail = {
    agent_id: "ag1",
    agent_name: "Security",
    model: "gpt-x",
    cases_total: 4,
    running: null,
    latest: R3,
    previous: R2,
    runs: [R3, R2, R1],
    trend: [],
    banner: null,
    ...over,
  };
  compare = {
    older: R2,
    newer: R3,
    common_case_ids: ["c1"],
    only_in_older: [{ case_id: "c2", name: "old-only-case" }],
    only_in_newer: [{ case_id: "c3", name: "new-only-case" }],
    metrics: {
      recall: { older: 0.78, newer: 0.82, delta: 0.04 },
      precision: { older: 0.5, newer: 0.5, delta: 0 },
      citation_accuracy: { older: null, newer: 1, delta: null },
      cost_usd: { older: 0.01, newer: 0.02, delta: 0.01 },
    },
    prompt_diff: [
      { op: "same", text: "You are a reviewer." },
      { op: "remove", text: "Be <b>brief</b>." },
      { op: "add", text: "Be thorough." },
    ],
    missing_snapshot_versions: [],
    skills_diff: [{ skill_id: "sk1", name: "owasp", change: "added", from_version: null, to_version: 2 }],
  };
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages, common }}>
      <EvalAgentView agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("EvalAgentView", () => {
  it("enables Compare only for exactly two selected runs and shows the old → new comparison", () => {
    setup();
    const compareBtn = screen.getByRole("button", { name: /^Compare$/ });
    expect(compareBtn).toBeDisabled();

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(compareBtn).toBeDisabled();
    fireEvent.click(boxes[1]!);
    expect(compareBtn).toBeEnabled();
    fireEvent.click(boxes[2]!);
    expect(compareBtn).toBeDisabled();
    fireEvent.click(boxes[2]!);
    fireEvent.click(compareBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("78% → 82% (+4 pt)")).toBeInTheDocument();
    expect(within(dialog).getByText("v2 → v3 · skills Δ")).toBeInTheDocument();
    expect(within(dialog).getByText("old-only-case")).toBeInTheDocument();
    expect(within(dialog).getByText("new-only-case")).toBeInTheDocument();
    expect(within(dialog).getByText("owasp", { exact: false })).toBeInTheDocument();

    const lines = dialog.querySelectorAll("[data-op]");
    expect(dialog.querySelectorAll('[data-op="remove"]')).toHaveLength(1);
    expect(dialog.querySelectorAll('[data-op="add"]')).toHaveLength(1);
    expect(lines).toHaveLength(3);
    // HTML in a prompt is text, never markup (UT-10).
    expect(within(dialog).getByText("Be <b>brief</b>.")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();
  });

  it("shows the snapshot notice with the deltas still present, and pushes the chosen agent", () => {
    setup();
    compare.prompt_diff = null;
    compare.missing_snapshot_versions = [2];
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: /^Compare$/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Prompt snapshot unavailable for v2")).toBeInTheDocument();
    expect(within(dialog).getByText("78% → 82% (+4 pt)")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag2" } });
    expect(push).toHaveBeenCalledWith("/eval/agents/ag2");
  });

  it("offers nothing to compare with a single run", () => {
    setup({ runs: [R3], previous: null });
    expect(screen.getByText("Run again to compare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Compare$/ })).toBeDisabled();
  });
});
