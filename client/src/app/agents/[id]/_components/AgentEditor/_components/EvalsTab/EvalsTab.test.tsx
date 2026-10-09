import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  Agent,
  EvalAgentDetail,
  EvalCaseDetail,
  EvalCaseListItem,
  EvalRunMetrics,
  EvalRunRecord,
} from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../../messages/en/common.json";

let searchCase: string | null = null;
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "case" ? searchCase : null) }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const createMutate = vi.fn();
let detailData: EvalAgentDetail | undefined;
let casesData: EvalCaseListItem[] | undefined;
let caseData: EvalCaseDetail | undefined;

const idle = { mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() };
vi.mock("@/lib/hooks/eval", () => ({
  useEvalAgentDetail: () => ({ data: detailData, isError: false, refetch: vi.fn() }),
  useEvalCases: () => ({ data: casesData, isError: false, refetch: vi.fn() }),
  useEvalCase: () => ({ data: caseData, isError: false, refetch: vi.fn() }),
  useUpdateEvalCase: () => ({ ...idle, mutate: updateMutate }),
  useDeleteEvalCase: () => ({ ...idle, mutate: deleteMutate }),
  useCreateEvalCase: () => ({ ...idle, mutate: createMutate }),
  useEvalEstimate: () => ({ data: undefined, isError: false }),
  useEvalRun: () => ({ data: undefined, isError: false }),
  useStartEvalRun: () => idle,
}));

import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "ag1", name: "Security" } as Agent;

const METRICS: EvalRunMetrics = {
  recall: 0.8,
  precision: 0.5,
  citation_accuracy: 1,
  cases_passed: 3,
  cases_total: 5,
  cases_errored: 0,
  uncovered_findings: 3,
};

function run(id: string, metrics: EvalRunMetrics | null): EvalRunRecord {
  return {
    id,
    agent_id: "ag1",
    agent_name: "Security",
    agent_version: 1,
    skills_fingerprint: [],
    skills_delta: false,
    status: "completed",
    error_reason: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: "2026-10-09T10:05:00.000Z",
    duration_ms: 1000,
    cost_usd: 0.01,
    case_ids: ["c1"],
    metrics,
  };
}

function detail(over: Partial<EvalAgentDetail> = {}): EvalAgentDetail {
  return {
    agent_id: "ag1",
    agent_name: "Security",
    model: "m",
    cases_total: 2,
    running: null,
    latest: null,
    previous: null,
    runs: [],
    trend: [],
    banner: null,
    ...over,
  };
}

const BASE_CASE = {
  owner_kind: "agent" as const,
  owner_id: "ag1",
  notes: null,
  input_diff: "+a",
  input_files: ["src/a.ts"],
  input_meta: { pr_id: null, pr_number: null, title: "T", body: null },
  source_finding_id: null,
  created_at: "",
  updated_at: "",
};

const ITEMS: EvalCaseListItem[] = [
  {
    ...BASE_CASE,
    id: "c1",
    name: "<script>alert(1)</script>",
    severity: "high",
    category: "security",
    expectation: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 5 },
    last: { run_id: "r1", status: "pass", findings_matched: 1 },
  },
  {
    ...BASE_CASE,
    id: "c2",
    name: "quiet",
    severity: null,
    category: null,
    expectation: { type: "must_not_flag", file: "src/b.ts", start_line: 2, end_line: 3 },
    last: { run_id: "r1", status: "fail", findings_matched: 2 },
  },
  {
    ...BASE_CASE,
    id: "c3",
    name: "broken",
    severity: null,
    category: null,
    expectation: { type: "must_find", file: "src/c.ts", start_line: 1, end_line: 1 },
    last: { run_id: "r1", status: "errored", findings_matched: null },
  },
  {
    ...BASE_CASE,
    id: "c4",
    name: "fresh",
    severity: null,
    category: null,
    expectation: { type: "must_find", file: "src/d.ts", start_line: 1, end_line: 1 },
    last: null,
  },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  searchCase = null;
  casesData = ITEMS;
  detailData = detail();
  caseData = undefined;
  updateMutate.mockReset();
  deleteMutate.mockReset();
  createMutate.mockReset();
});
afterEach(cleanup);

describe("Evals tab", () => {
  it("shows tiles with deltas, the badge, the uncovered line, the note and the case rows", () => {
    detailData = detail({
      latest: run("r2", METRICS),
      previous: run("r1", { ...METRICS, recall: 0.5, uncovered_findings: 0 }),
      runs: [run("r2", METRICS), run("r1", METRICS)],
    });
    renderTab();

    expect(screen.getByTestId("metric-recall")).toHaveTextContent("80%");
    expect(screen.getByTestId("metric-recall")).toHaveTextContent("+30 pt");
    expect(screen.getByTestId("metric-precision")).toHaveTextContent("0 pt");
    expect(screen.getAllByText("3 / 5 passing").length).toBeGreaterThan(0);
    expect(screen.getByText("3 findings not covered by any case")).toBeInTheDocument();
    expect(screen.getByText(/Scoring is mechanical/)).toBeInTheDocument();
    expect(screen.queryByText("Run again to compare")).not.toBeInTheDocument();

    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("high · security")).toBeInTheDocument();
    expect(screen.getByText("expected ≥ 1 finding at src/a.ts:1–5, got 1")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings at src/b.ts:2–3, got 2")).toBeInTheDocument();
    expect(screen.getByText("expected ≥ 1 finding at src/c.ts:1–1")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("errored")).toBeInTheDocument();
  });

  it("handles the empty, never-run and one-run states", () => {
    casesData = [];
    const { unmount } = renderTab();
    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText("Run all evals")).not.toBeInTheDocument();
    unmount();

    casesData = ITEMS;
    const second = renderTab();
    expect(screen.getByText("Never run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeInTheDocument();
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
    second.unmount();

    detailData = detail({ latest: run("r1", METRICS), runs: [run("r1", METRICS)] });
    renderTab();
    expect(screen.getByText("Run again to compare")).toBeInTheDocument();
    expect(screen.queryByText(/ pt$/)).not.toBeInTheDocument();
  });

  it("opens the editor from a row, shows banner, tabs and outcome as text, saves and deletes", () => {
    caseData = {
      ...ITEMS[0]!,
      name: "leak",
      expectation: { type: "must_find", file: "src/<b>x</b>.ts", start_line: 1, end_line: 5 },
      source: null,
      source_deleted: true,
      last_outcome: {
        run_id: "r1",
        outcome: {
          case_id: "c1",
          name: "leak",
          expectation_type: "must_find",
          status: "scored",
          pass: false,
          error_reason: null,
          findings_total: 1,
          findings_matched: 0,
          grounding_kept: 1,
          grounding_total: 1,
          duration_ms: 1,
          cost_usd: null,
          actual: [
            {
              file: "src/z.ts",
              start_line: 1,
              end_line: 2,
              severity: "low",
              category: "style",
              title: "t",
              rationale: "<img src=x onerror=alert(1)>",
              matched: false,
            },
          ],
        },
      },
    };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /<script>/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Positive case — MUST find a finding at src/<b>x</b>.ts:1–5")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByText("Source finding deleted")).toBeInTheDocument();
    for (const name of ["Diff", "Files", "PR meta"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Type")).toHaveValue("must_find");

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "renamed" } });
    fireEvent.change(dialog.getByLabelText("End line"), { target: { value: "9" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "c1",
        patch: {
          name: "renamed",
          expectation: { type: "must_find", file: "src/<b>x</b>.ts", start_line: 1, end_line: 9 },
        },
      },
      expect.anything(),
    );

    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(dialog.getByText("Delete this eval case?")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("opens the case named by ?case= and creates a manual case", () => {
    searchCase = "c1";
    caseData = {
      ...ITEMS[0]!,
      source: { repo_id: "r", pr_number: 7 },
      source_deleted: false,
      last_outcome: null,
    };
    const { unmount } = renderTab();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Source finding/ })).toHaveAttribute("href", "/repos/r/pulls/7");
    unmount();

    searchCase = null;
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "New case" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "manual" } });
    fireEvent.change(dialog.getByLabelText("Input"), { target: { value: "+x" } });
    fireEvent.change(dialog.getByLabelText("File"), { target: { value: "a.ts" } });
    fireEvent.change(dialog.getByLabelText("Start line"), { target: { value: "1" } });
    fireEvent.change(dialog.getByLabelText("End line"), { target: { value: "2" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "manual",
        notes: null,
        input_diff: "+x",
        pr_title: "",
        pr_body: null,
        expectation: { type: "must_find", file: "a.ts", start_line: 1, end_line: 2 },
      },
      expect.anything(),
    );
  });
});
