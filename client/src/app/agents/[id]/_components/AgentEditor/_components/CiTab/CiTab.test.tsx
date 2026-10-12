import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import { ToastProvider } from "@/lib/toast";

let installationsState: { data?: CiInstallation[]; isLoading: boolean } = { data: [], isLoading: false };
let runsState: { data?: { runs: CiRun[] } } = { data: { runs: [] } };
const updateMutate = vi.fn();
const runsQuerySpy = vi.fn();

vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => installationsState,
  useCiRuns: (q: unknown) => {
    runsQuerySpy(q);
    return runsState;
  },
}));
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock("./_components/ExportWizard", () => ({
  ExportWizard: (p: { open: boolean; agentName: string; initial?: { step: string; repo?: string } }) =>
    p.open ? (
      <div role="dialog" aria-label="wizard">
        <span>{p.agentName}</span>
        <span data-testid="step">{p.initial?.step}</span>
        <span data-testid="repo">{p.initial?.repo ?? ""}</span>
      </div>
    ) : null,
}));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function inst(over: Partial<CiInstallation>): CiInstallation {
  return {
    id: "i1",
    agent_id: "ag1",
    repo: "acme/payments-api",
    target_type: "gha",
    github_repo_id: 1,
    manifest_slug: "security-reviewer",
    triggers: ["opened", "synchronize"],
    post_as: "github_review",
    workflow_version: "abcdef123456",
    generator_version: 1,
    agent_version: 1,
    exported_ci_fail_on: "critical",
    pr_url: null,
    state: "active",
    outdated: false,
    installed_at: "2026-10-01T00:00:00Z",
    updated_at: null,
    last_refreshed_at: null,
    last_run: null,
    ...over,
  };
}

function run(i: number): CiRun {
  return {
    id: `r${i}`,
    ci_installation_id: "i1",
    provider_run_id: `p${i}`,
    repo: `acme/repo-${i}`,
    pr_number: i,
    pr_title: null,
    pr_url: null,
    commit_sha: null,
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    ran_at: new Date().toISOString(),
    status: "succeeded",
    findings_count: 1,
    critical: 0,
    warning: 1,
    suggestion: 0,
    verdict: "comment",
    blockers: 0,
    cost_usd: 0.01,
    duration_ms: 1000,
    job_url: null,
    source: "gha",
    failure_reason: null,
    agent_run_id: null,
    ingested_at: new Date().toISOString(),
  };
}

function renderTab(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <ToastProvider>
        <CiTab agent={agent} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  installationsState = { data: [], isLoading: false };
  runsState = { data: { runs: [] } };
});

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
  runsQuerySpy.mockClear();
});

describe("CiTab", () => {
  it("shows the empty state and opens the wizard at Target; an HTML agent name stays text", () => {
    renderTab({ ...AGENT, name: "<b>Bold</b>" });
    expect(screen.getByText("Not in CI yet")).toBeInTheDocument();
    expect(screen.queryByText(/Active in/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("step")).toHaveTextContent("target");
    expect(within(dialog).getByText("<b>Bold</b>")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();
  });

  it("lists installations with state, drift and last run; Update and Add repository pre-fill the wizard", () => {
    installationsState = {
      data: [
        inst({ id: "i1", repo: "acme/payments-api", last_run: { status: "succeeded", verdict: "approve", ran_at: new Date().toISOString() } }),
        inst({ id: "i2", repo: "acme/billing-worker", exported_ci_fail_on: "never", outdated: true, workflow_version: null }),
        inst({ id: "i3", repo: "acme/web", state: "pr_open" }),
        inst({ id: "i4", repo: "acme/unknown", state: null }),
      ],
      isLoading: false,
    };
    renderTab();

    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getAllByText("GitHub Actions")).toHaveLength(4);
    expect(screen.getByText("PR open")).toBeInTheDocument();
    // State chip for the null-state installation + the unknown workflow version of acme/billing-worker.
    expect(screen.getAllByText("unknown")).toHaveLength(2);
    expect(screen.getAllByText("workflow abcdef123456")).toHaveLength(3);
    expect(screen.getByText("outdated")).toBeInTheDocument();
    expect(screen.getByText("Approve · now")).toBeInTheDocument();
    expect(screen.getAllByText("No runs yet")).toHaveLength(3);
    // Only the differing installation shows drift.
    expect(screen.getAllByText(/installed:/)).toHaveLength(1);
    expect(screen.getByText("installed: Never · current: Critical")).toBeInTheDocument();

    // The drift row's own Update action (second "Update CI config": header first, row after).
    const updates = screen.getAllByRole("button", { name: "Update CI config" });
    fireEvent.click(updates[updates.length - 1]!);
    expect(screen.getByTestId("step")).toHaveTextContent("preview");
    expect(screen.getByTestId("repo")).toHaveTextContent("acme/billing-worker");
    cleanup();

    installationsState = { data: [inst({})], isLoading: false };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(screen.getByTestId("step")).toHaveTextContent("target");
    expect(screen.getByTestId("repo")).toBeEmptyDOMElement();
  });

  it("with several installations the header Update asks which one first", () => {
    installationsState = {
      data: [inst({ id: "i1", repo: "acme/a" }), inst({ id: "i2", repo: "acme/b" })],
      isLoading: false,
    };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));
    const picker = screen.getByRole("dialog", { name: "Choose the installation to update" });
    fireEvent.click(within(picker).getByRole("button", { name: "acme/b" }));
    expect(screen.getByTestId("step")).toHaveTextContent("preview");
    expect(screen.getByTestId("repo")).toHaveTextContent("acme/b");
  });

  it("Fail CI on: reflects the agent, saves on select, supports arrow keys, handles `any`", () => {
    const { unmount } = renderTab({ ...AGENT, ci_fail_on: "warning" });
    const group = screen.getByRole("radiogroup", { name: "Fail CI on" });
    expect(within(group).getByRole("radio", { name: "Warning +" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Critical" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(within(group).getByRole("radio", { name: "Critical" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "critical" } }, expect.anything());

    updateMutate.mockClear();
    const warning = within(group).getByRole("radio", { name: "Warning +" });
    warning.focus();
    fireEvent.keyDown(warning, { key: "ArrowRight" });
    expect(within(group).getByRole("radio", { name: "Never" })).toHaveFocus();
    expect(updateMutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "never" } }, expect.anything());
    unmount();

    updateMutate.mockClear();
    renderTab({ ...AGENT, ci_fail_on: "any" });
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Any finding — set in the Config tab")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Critical" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "critical" } }, expect.anything());
  });

  it("copies the required check name to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("DevDigest Review / review");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("lists at most 10 recent runs and links to the agent-filtered CI Runs page", () => {
    installationsState = { data: [inst({})], isLoading: false };
    runsState = { data: { runs: Array.from({ length: 12 }, (_, i) => run(i + 1)) } };
    renderTab();
    expect(runsQuerySpy).toHaveBeenCalledWith({ agent_id: "ag1", from: "1970-01-01T00:00:00.000Z", limit: 10 });
    const list = screen.getByRole("list", { name: "Recent runs" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByRole("link", { name: "View all CI runs" })).toHaveAttribute("href", "/ci-runs?agent=ag1");
  });
});
