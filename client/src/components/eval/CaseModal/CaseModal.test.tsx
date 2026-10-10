import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseDetail, EvalCaseDraft, EvalCaseRunResult } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import commonMessages from "../../../../messages/en/common.json";

const runMutateAsync = vi.fn();
const saveMutate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
const idle = { mutate: vi.fn(), isPending: false, error: null as unknown };
vi.mock("@/lib/hooks/eval", () => ({
  useRunEvalCase: () => ({ mutateAsync: runMutateAsync }),
  useSaveEvalCaseFromFinding: () => ({ ...idle, mutate: saveMutate }),
  useCreateEvalCase: () => ({ ...idle, mutate: createMutate }),
  useUpdateEvalCase: () => ({ ...idle, mutate: updateMutate }),
}));

import { CaseModal } from "./CaseModal";

const DRAFT: EvalCaseDraft = {
  agent_id: "ag1",
  agent_name: "Security",
  source_finding_id: "f1",
  name: "stripe-key",
  input_diff: "+const k = 1;",
  input_files: ["src/a.ts"],
  input_meta: { title: "Add stripe", body: null },
  expectation: { type: "must_not_flag", file: "src/a.ts", start_line: 3, end_line: 5 },
  severity: "high",
  category: "security",
} as EvalCaseDraft;

const DETAIL = {
  id: "c1",
  owner_id: "ag1",
  name: "saved-case",
  notes: null,
  input_diff: "+a",
  input_files: ["src/a.ts"],
  input_meta: { title: "T", body: null },
  expectation: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2 },
  last_outcome: null,
  source: null,
  source_deleted: false,
} as unknown as EvalCaseDetail;

function result(over: Partial<EvalCaseRunResult> = {}): EvalCaseRunResult {
  return {
    status: "scored",
    pass: true,
    error_reason: null,
    findings_total: 2,
    findings_matched: 1,
    actual: [
      { file: "src/a.ts", start_line: 3, end_line: 4, severity: "high", category: "security", title: "Leaked key", rationale: "r", matched: true },
      { file: "src/b.ts", start_line: 1, end_line: 1, severity: "low", category: "style", title: "Nit", rationale: "r2", matched: false },
    ],
    duration_ms: 4200,
    cost_usd: null,
    agent_version: 3,
    masked: { input_diff: "+const k = 1;", pr_title: "Add stripe", pr_body: null },
    ...over,
  };
}

const onClose = vi.fn();
const onSaved = vi.fn();

function mount(props: Parameters<typeof CaseModal>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
      <CaseModal {...props} />
    </NextIntlClientProvider>,
  );
}
const finding = () => mount({ mode: "finding", agentId: "ag1", findingId: "f1", draft: DRAFT, onSaved, onClose });

const saveBtn = () => screen.getByRole("button", { name: "Save" });
const runBtn = () => screen.getByRole("button", { name: "Run case" });
const GATE = "Run the case on its current content before saving";

async function runNow() {
  await act(async () => {
    fireEvent.click(runBtn());
  });
}

beforeEach(() => {
  runMutateAsync.mockReset();
  saveMutate.mockReset();
  createMutate.mockReset();
  updateMutate.mockReset();
  onClose.mockReset();
});
afterEach(cleanup);

describe("CaseModal", () => {
  it("finding mode: pre-filled, locked type, gated Save, banner, stale, no save on open — AC-88, AC-90, AC-100–AC-103", async () => {
    runMutateAsync.mockResolvedValue(result());
    finding();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("stripe-key");
    expect((screen.getByLabelText("File") as HTMLInputElement).value).toBe("src/a.ts");
    expect(screen.getByText("MUST NOT FLAG")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByText(GATE)).toBeInTheDocument();
    expect(saveMutate).not.toHaveBeenCalled();

    await runNow();
    expect(runMutateAsync).toHaveBeenCalledWith({
      input_diff: "+const k = 1;",
      pr_title: "Add stripe",
      pr_body: null,
      expectation: { type: "must_not_flag", file: "src/a.ts", start_line: 3, end_line: 5 },
    });
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("expected 0 at src/a.ts:3–5, got 1")).toBeInTheDocument();
    expect(screen.getByText("4.2 s · —")).toBeInTheDocument();
    expect(screen.getByText("Leaked key")).toBeInTheDocument();
    expect(screen.getByText("Nit")).toBeInTheDocument();
    expect(screen.getAllByText("matched")).toHaveLength(1);
    expect(saveBtn()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "9" } });
    expect(screen.getByText("Inputs changed since this run — run again")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "5" } });
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(saveMutate).toHaveBeenCalledTimes(1);
    expect(saveMutate.mock.calls[0]?.[0]).toMatchObject({ name: "stripe-key", input_diff: "+const k = 1;" });
  });

  it("an errored run keeps Save disabled and shows the mapped reason; unknown codes render raw — AC-104, EC-30", async () => {
    runMutateAsync.mockResolvedValueOnce(result({ status: "errored", pass: null, error_reason: "timeout", actual: [] }));
    finding();
    await runNow();
    expect(screen.getByText("Timed out after 120 s")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();

    runMutateAsync.mockResolvedValueOnce(result({ status: "errored", pass: null, error_reason: "weird_code", actual: [] }));
    await runNow();
    expect(screen.getByText("weird_code")).toBeInTheDocument();
  });

  it("renders hostile finding text as text, never as elements — UT-14", async () => {
    const evil = '<img src=x onerror="alert(1)">';
    runMutateAsync.mockResolvedValue(
      result({ actual: [{ file: evil, start_line: 1, end_line: 1, severity: "high", category: "c", title: evil, rationale: evil, matched: false }] }),
    );
    const { container } = finding();
    await runNow();
    expect(container.ownerDocument.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
  });

  it("puts the masked text the server used into the form — EC-32", async () => {
    runMutateAsync.mockResolvedValue(result({ masked: { input_diff: "+const k = [MASKED];", pr_title: "Add stripe", pr_body: null } }));
    finding();
    await runNow();
    expect((screen.getByLabelText("Input") as HTMLTextAreaElement).value).toBe("+const k = [MASKED];");
    expect(saveBtn()).toBeEnabled();
  });

  it("asks before discarding an edited or run draft and closes an untouched one at once — AC-105, AC-106", async () => {
    finding();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "renamed" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Discard this draft?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard this draft?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(saveMutate).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("drops a response that arrives after close — AC-107, EC-26", async () => {
    let resolve!: (r: EvalCaseRunResult) => void;
    runMutateAsync.mockReturnValue(new Promise<EvalCaseRunResult>((r) => (resolve = r)));
    const view = finding();
    fireEvent.click(runBtn());
    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
    view.unmount();
    await act(async () => {
      resolve(result());
    });
    expect(screen.queryByText("Passed")).toBeNull();
  });

  it("saved mode: a rename saves without a run, a range change needs a scored run — AC-109, AC-45", async () => {
    runMutateAsync.mockResolvedValue(result({ masked: { input_diff: "+a", pr_title: "T", pr_body: null } }));
    mount({ mode: "saved", agentId: "ag1", detail: DETAIL, onSaved, onClose });
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "renamed" } });
    expect(saveBtn()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "7" } });
    expect(saveBtn()).toBeDisabled();
    await runNow();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(updateMutate.mock.calls[0]?.[0]).toMatchObject({ id: "c1", patch: { name: "renamed", expectation: { end_line: 7 } } });
  });

  it("manual mode: type select present, Save gated until a scored run — AC-110", async () => {
    runMutateAsync.mockResolvedValue(result({ masked: { input_diff: "+x", pr_title: "", pr_body: null } }));
    mount({ mode: "manual", agentId: "ag1", onSaved, onClose });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "m" } });
    fireEvent.change(screen.getByLabelText("Input"), { target: { value: "+x" } });
    fireEvent.change(screen.getByLabelText("File"), { target: { value: "a.ts" } });
    fireEvent.change(screen.getByLabelText("Start line"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "2" } });
    expect(saveBtn()).toBeDisabled();
    await runNow();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(createMutate).toHaveBeenCalledTimes(1);
  });
});
