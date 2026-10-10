import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../../../../messages/en/common.json";
import { api, ApiError } from "@/lib/api";
import { EvalCaseAction } from "./EvalCaseAction";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const DRAFT = {
  kind: "draft",
  draft: {
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
  },
};

const RUN = {
  status: "scored",
  pass: true,
  error_reason: null,
  findings_total: 0,
  findings_matched: 0,
  actual: [],
  duration_ms: 1000,
  cost_usd: null,
  agent_version: 1,
  masked: { input_diff: "+const k = 1;", pr_title: "Add stripe", pr_body: null },
};

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

function renderAction(triaged: boolean) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
        <EvalCaseAction findingId="f1" triaged={triaged} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalCaseAction", () => {
  it("is disabled with a hint while the finding is untriaged — AC-3", () => {
    renderAction(false);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
    expect(screen.getByText("Accept or dismiss first")).toBeInTheDocument();
  });

  it("opens the draft without saving, then Run + Save turns it into an 'Eval case ✓' link — AC-88, AC-12", async () => {
    vi.mocked(api.get).mockResolvedValue(DRAFT);
    vi.mocked(api.post).mockImplementation(async (path: string) =>
      path === "/findings/f1/eval-case" ? { id: "c1", owner_id: "ag1" } : RUN,
    );
    renderAction(true);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(api.get).toHaveBeenCalledWith("/findings/f1/eval-case-draft");
    expect(api.post).not.toHaveBeenCalled();
    expect(dialog.getByLabelText("Name")).toHaveValue("stripe-key");
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(dialog.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    const link = await screen.findByRole("link", { name: "Eval case ✓" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals&case=c1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/findings/f1/eval-case", expect.objectContaining({ name: "stripe-key" }));
  });

  it("navigates to the existing case instead of opening a modal — AC-89", async () => {
    vi.mocked(api.get).mockResolvedValue({ kind: "existing_case", case_id: "c9", owner_id: "ag2" });
    renderAction(true);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/agents/ag2?tab=evals&case=c9"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the reason for a 422 and keeps the button — AC-74", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError("x", 422, "diff_unavailable"));
    renderAction(true);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No diff is available for this finding's file"),
    );
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});
