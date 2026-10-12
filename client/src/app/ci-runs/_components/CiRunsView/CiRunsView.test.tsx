import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun, CiRunsQuery } from "@devdigest/shared";
import ciMessages from "../../../../../messages/en/ci.json";

const AGENT_A = "11111111-1111-4111-8111-111111111111";
const AGENT_B = "22222222-2222-4222-8222-222222222222";

let RUNS: CiRun[] = [];
let SEARCH = "";
/** Server dictionaries (agents/repos) cover every stored run, not just the filtered page. */
let WORKSPACE_HAS_RUNS = true;
let refreshState: { isPending: boolean; data?: { degraded: boolean; reason: string | null } } = { isPending: false };
const refreshMutate = vi.fn();
const routerReplace = vi.fn();
const runsQuerySpy = vi.fn();
const traceSpy = vi.fn();

/** Mimics the server: applies the query the view sent to the fixture rows. */
function serve(q: Partial<CiRunsQuery>) {
  runsQuerySpy(q);
  const runs = RUNS.filter(
    (r) =>
      (!q.from || Date.parse(r.ran_at) >= Date.parse(q.from)) &&
      (!q.agent_id || r.agent_id === q.agent_id) &&
      (!q.repo || r.repo === q.repo) &&
      (!q.status || r.status === q.status) &&
      (!q.source || r.source === q.source),
  );
  return {
    runs,
    agents: WORKSPACE_HAS_RUNS
      ? [
          { id: AGENT_A, name: "Security" },
          { id: AGENT_B, name: "Style" },
        ]
      : [],
    repos: WORKSPACE_HAS_RUNS ? ["acme/api", "acme/web"] : [],
  };
}

vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: (q: Partial<CiRunsQuery>) => ({ data: serve(q), isLoading: false, refetch: vi.fn() }),
  useRefreshCiRuns: () => ({ mutate: refreshMutate, ...refreshState }),
}));
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: (id: string) => {
    traceSpy(id);
    return { data: undefined, isLoading: false };
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH),
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

import { CiRunsView } from "./CiRunsView";

function run(o: Partial<CiRun>): CiRun {
  return {
    id: "run-1",
    ci_installation_id: "inst-1",
    provider_run_id: "1001",
    repo: "acme/api",
    pr_number: 42,
    pr_title: "Add rate limiting",
    pr_url: "https://github.com/acme/api/pull/42",
    commit_sha: "a".repeat(40),
    agent_id: AGENT_A,
    agent_name: "Security",
    ran_at: new Date().toISOString(),
    status: "succeeded",
    findings_count: 3,
    critical: 1,
    warning: 2,
    suggestion: 0,
    verdict: "request_changes",
    blockers: 1,
    cost_usd: 0.0123,
    duration_ms: 8000,
    job_url: "https://github.com/acme/api/actions/runs/1001",
    source: "gha",
    failure_reason: null,
    agent_run_id: "agent-run-1",
    ingested_at: new Date().toISOString(),
    ...o,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <CiRunsView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  RUNS = [];
  SEARCH = "";
  WORKSPACE_HAS_RUNS = true;
  refreshState = { isPending: false };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("CiRunsView", () => {
  it("renders title, every column, the job/PR links and opens the trace drawer for a run", () => {
    RUNS = [run({})];
    renderView();

    expect(screen.getByRole("heading", { name: ciMessages.runs.title })).toBeInTheDocument();
    expect(screen.getByText(ciMessages.runs.subtitle)).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);

    expect(screen.getByText("acme/api", { selector: "td span" })).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Security", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(ciMessages.runs.verdict.request_changes)).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getByText("8.0 s")).toBeInTheDocument();
    expect(screen.getByText(ciMessages.runs.status.succeeded, { selector: "span" })).toBeInTheDocument();

    const job = screen.getByRole("link", { name: ciMessages.runs.job });
    expect(job).toHaveAttribute("href", "https://github.com/acme/api/actions/runs/1001");
    expect(job).toHaveAttribute("target", "_blank");
    expect(job).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /Add rate limiting/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/42",
    );

    fireEvent.click(screen.getByRole("button", { name: ciMessages.runs.trace }));
    expect(traceSpy).toHaveBeenCalledWith("agent-run-1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(ciMessages.runs.traceUnavailable)).toBeInTheDocument();
  });

  it("defaults to the last 7 days and each URL filter narrows the rows", () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    RUNS = [
      run({ id: "r1", pr_title: "Fresh" }),
      run({ id: "r2", pr_title: "Old", ran_at: old }),
      run({ id: "r3", pr_title: "Other agent", agent_id: AGENT_B, agent_name: "Style" }),
      run({ id: "r4", pr_title: "Other repo", repo: "acme/web" }),
      run({ id: "r5", pr_title: "Broken", status: "failed", failure_reason: "boom" }),
    ];
    const rows = () => screen.queryAllByRole("row").length - 1;

    renderView();
    const sent = runsQuerySpy.mock.calls[0]?.[0] as Partial<CiRunsQuery>;
    const ageDays = (Date.now() - Date.parse(sent.from as string)) / 86_400_000;
    expect(ageDays).toBeGreaterThan(6.9);
    expect(ageDays).toBeLessThan(7.1);
    expect(rows()).toBe(4); // "Old" is outside the default window
    cleanup();

    for (const [search, expected] of [
      ["range=all", 5],
      [`agent=${AGENT_B}`, 1],
      ["repo=acme%2Fweb", 1],
      ["status=failed", 1],
      ["source=gha", 4],
    ] as const) {
      SEARCH = search;
      renderView();
      expect(rows()).toBe(expected);
      cleanup();
    }

    SEARCH = "";
    renderView();
    fireEvent.change(screen.getByDisplayValue(ciMessages.runs.filters.last7Days), { target: { value: "30d" } });
    expect(routerReplace).toHaveBeenCalledWith("/ci-runs?range=30d");
  });

  it("shows the empty state only when the workspace has no CI runs at all", () => {
    // Runs exist but all are older than the default 7-day window: filters + noMatches, not the empty state.
    RUNS = [run({ ran_at: new Date(Date.now() - 20 * 86_400_000).toISOString() })];
    renderView();
    expect(screen.getByText(ciMessages.runs.noMatches)).toBeInTheDocument();
    expect(screen.getByDisplayValue(ciMessages.runs.filters.last7Days)).toBeInTheDocument();
    expect(screen.queryByText(ciMessages.runs.emptyTitle)).not.toBeInTheDocument();
    cleanup();

    WORKSPACE_HAS_RUNS = false;
    RUNS = [];
    renderView();
    expect(screen.getByText(ciMessages.runs.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ciMessages.runs.emptyCta })).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    cleanup();

    WORKSPACE_HAS_RUNS = true;
    SEARCH = "status=failed";
    renderView();
    expect(screen.getByText(ciMessages.runs.noMatches)).toBeInTheDocument();
  });

  it("forces a refresh on click, shows the pending label, and surfaces a degraded reason above the table", () => {
    RUNS = [run({ status: "failed", failure_reason: "commit mismatch" })];
    refreshState = { isPending: true, data: { degraded: true, reason: "GitHub rate limited" } };
    renderView();

    expect(screen.getByRole("button", { name: ciMessages.runs.refreshing })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't refresh from GitHub: GitHub rate limited");
    expect(screen.getByText("Reason: commit mismatch")).toBeInTheDocument();
    cleanup();

    refreshState = { isPending: false };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: ciMessages.runs.refresh }));
    expect(refreshMutate).toHaveBeenCalledWith(true);
  });

  it("truncates long titles with a tooltip and renders hostile content as plain text", () => {
    const longTitle = "A very long pull request title ".repeat(10).trim();
    RUNS = [
      run({ id: "r1", pr_title: longTitle }),
      run({ id: "r2", pr_title: "<img src=x onerror=alert(1)>", job_url: "javascript:alert(1)" }),
    ];
    const { container } = renderView();

    const long = screen.getByText(longTitle);
    expect(long).toHaveAttribute("title", longTitle);
    expect(long).toHaveStyle({ textOverflow: "ellipsis", overflow: "hidden" });

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link", { name: ciMessages.runs.job })).toHaveLength(1);
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("auto-refreshes without force every 30 s, but not while the tab is hidden", () => {
    vi.useFakeTimers();
    RUNS = [run({})];
    renderView();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(refreshMutate).toHaveBeenCalledTimes(1);
    expect(refreshMutate).toHaveBeenCalledWith(false);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refreshMutate).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
