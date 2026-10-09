import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrDetail, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";

// A real hunk so the CRITICAL finding on line 12 anchors to a rendered line
// (new-side numbering: header starts at 10, two context lines, one added).
const CONFIG_PATCH = "@@ -10,2 +10,3 @@\n line10\n line11\n+stripeKey: STRIPE_LIVE_KEY,";

function findingFixture(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "file" | "review_id">): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: "a finding",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const REVIEWS: ReviewRecord[] = [
  // newest first — usePrReviews' natural order
  {
    id: "r-new",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run2",
    agent_name: "Agent A",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 40,
    model: "gpt",
    grounding: null,
    created_at: "2026-09-27T12:00:00Z",
    findings: [
      findingFixture({
        id: "f1",
        severity: "CRITICAL",
        title: "Hardcoded Stripe secret key in commit",
        file: "src/config.ts",
        start_line: 12,
        review_id: "r-new",
      }),
      findingFixture({
        id: "f2",
        severity: "WARNING",
        title: "Weak input validation",
        file: "src/config.ts",
        start_line: 20,
        review_id: "r-new",
      }),
      findingFixture({
        id: "f3",
        severity: "WARNING",
        title: "Missing edge-case test",
        file: "src/utils.ts",
        start_line: 5,
        review_id: "r-new",
      }),
      findingFixture({
        id: "f-dismissed",
        severity: "SUGGESTION",
        title: "Already rejected",
        file: "src/utils.ts",
        start_line: 8,
        review_id: "r-new",
        dismissed_at: "2026-09-27T12:05:00Z",
      }),
    ],
  },
  {
    id: "r-old",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent A",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 10,
    model: "gpt",
    grounding: null,
    created_at: "2026-09-27T10:00:00Z",
    findings: [
      findingFixture({
        id: "f-old",
        severity: "CRITICAL",
        title: "Superseded finding",
        file: "src/config.ts",
        start_line: 12,
        review_id: "r-old",
      }),
    ],
  },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [12, 20] },
        { path: "src/utils.ts", additions: 2, deletions: 0, finding_lines: [5] },
      ],
    },
    { role: "tests", files: [{ path: "src/utils.test.ts", additions: 10, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 3, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 50, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 70, proposed_splits: [] },
};

const PR: PrDetail = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "octocat",
  branch: "feat/rate-limit",
  base: "main",
  head_sha: "abc123",
  additions: 70,
  deletions: 0,
  files_count: 6,
  status: "open",
  opened_at: null,
  updated_at: null,
  score: null,
  cost_usd: null,
  findings: null,
  body: null,
  commits: [],
  linked_issue: null,
  files: [
    { path: "src/config.ts", additions: 4, deletions: 0, patch: CONFIG_PATCH },
    { path: "src/utils.ts", additions: 2, deletions: 0, patch: null },
    { path: "src/utils.test.ts", additions: 10, deletions: 0, patch: null },
    { path: "src/index.ts", additions: 1, deletions: 0, patch: null },
    { path: "README.md", additions: 3, deletions: 0, patch: null },
    { path: "pnpm-lock.yaml", additions: 50, deletions: 0, patch: null },
  ],
};

let reviewsData: ReviewRecord[] = REVIEWS;
const mutate = vi.fn();
let smartDiffState: { data?: SmartDiffResponse; isLoading: boolean; isError: boolean } = {
  data: SMART_DIFF,
  isLoading: false,
  isError: false,
};

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: reviewsData }),
  useFindingAction: () => ({ mutate, isPending: false }),
}));

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => smartDiffState,
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  reviewsData = REVIEWS;
  smartDiffState = { data: SMART_DIFF, isLoading: false, isError: false };
});

function renderTab({
  prId = "pr1",
  pr = PR,
  targetFile,
  targetLine,
}: { prId?: string | null; pr?: PrDetail; targetFile?: string | null; targetLine?: string | null } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="en"
        messages={{ prReview: prReviewMessages, shell: shellMessages, brief: briefMessages, eval: evalMessages }}
      >
        <DiffTab
          prId={prId}
          pr={pr}
          repoFullName="acme/widgets"
          targetFile={targetFile}
          targetLine={targetLine}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab — deep-link target (SPEC-04)", () => {
  const scrollIntoView = vi.fn();
  // A big boilerplate file (> 200 changed lines → starts collapsed) with a real hunk.
  const BIG_LOCK = { path: "pnpm-lock.yaml", additions: 300, deletions: 0, patch: "@@ -1,1 +1,3 @@\n a\n+b\n+c" };
  const bigPr: PrDetail = { ...PR, files: [...PR.files.slice(0, 5), BIG_LOCK] };

  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a collapsed boilerplate group and a >200-line card, scrolls to and briefly highlights the line (Smart order)", () => {
    renderTab({ pr: bigPr, targetFile: "pnpm-lock.yaml", targetLine: "3" });

    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    const row = screen.getByText("c", { selector: "span.mono" }).closest("[data-target-highlight]");
    expect(row).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(document.querySelector("[data-target-highlight]")).toBeNull();

    // Group stays toggleable.
    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
  });

  it("works in Original order and scrolls the header for a file-only target", () => {
    renderTab({ pr: bigPr, targetFile: "pnpm-lock.yaml" });
    fireEvent.click(screen.getByRole("radio", { name: "Original order" }));
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("shows 'Line 999 is not in the diff' at the file header", () => {
    renderTab({ targetFile: "src/config.ts", targetLine: "999" });
    expect(screen.getByText("Line 999 is not in the diff")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("shows the file-not-in-diff notice for an unknown path and ignores a bad line", () => {
    renderTab({ targetFile: "../x", targetLine: "abc" });
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    cleanup();
    renderTab({ targetFile: "src/config.ts", targetLine: "abc" });
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
    expect(screen.queryByText(/is not in the diff/)).not.toBeInTheDocument();
  });
});

describe("DiffTab — Smart order", () => {
  it("groups files by role in order, collapses docs/boilerplate, and counts flagged files (ignoring dismissed/superseded findings)", () => {
    renderTab();

    const groupLabels = ["Core logic", "Tests", "Wiring", "Docs", "Boilerplate"];
    const labelNodes = groupLabels.map((label) => screen.getByText(label));
    // Order in the DOM follows SmartDiffRole order: each label precedes the next.
    for (let i = 0; i < labelNodes.length - 1; i++) {
      expect(labelNodes[i]!.compareDocumentPosition(labelNodes[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // Core + tests + wiring start expanded — their files are visible.
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("src/utils.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();

    // Docs/boilerplate start collapsed.
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    // 3 findings (f1, f2, f3) across 2 files (config.ts, utils.ts) — dismissed
    // and superseded findings add nothing.
    expect(screen.getByLabelText("2 files with findings")).toBeInTheDocument();
    expect(screen.queryByText("Already rejected")).not.toBeInTheDocument();
    expect(screen.queryByText("Superseded finding")).not.toBeInTheDocument();

    // Expanding a collapsed group reveals its file.
    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});

describe("DiffTab — finding in the diff", () => {
  it("shows the blocker label under the flagged line and rejects via useFindingAction", () => {
    renderTab();

    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();

    const card = screen.getByText("Hardcoded Stripe secret key in commit").closest("div[data-finding-id]")!;
    fireEvent.click(within(card as HTMLElement).getByText("Reject"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });
  });
});

describe("DiffTab — order toggle", () => {
  it("Original order renders files flat (no group headers), dot still present", () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Original order" }));

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    // Both flagged files (config.ts, utils.ts) keep their dot in flat order too.
    expect(screen.getAllByLabelText("Has review findings")).toHaveLength(2);
  });
});

describe("DiffTab — smart-diff error", () => {
  it("shows the load-error notice, falls back to Original order, and disables the toggle", () => {
    smartDiffState = { data: undefined, isLoading: false, isError: true };
    renderTab();

    expect(screen.getByText("Couldn’t group files by role — showing the original order.")).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Smart order" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Original order" })).toBeDisabled();
  });
});

describe("DiffTab — no grouping data", () => {
  it("falls back to the flat view while prId is null (smart-diff query disabled)", () => {
    smartDiffState = { data: undefined, isLoading: false, isError: false };
    renderTab({ prId: null });

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Smart order" })).toBeDisabled();
  });

  it("shows DiffViewer's empty state for a PR with no changed files", () => {
    smartDiffState = {
      data: { groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } },
      isLoading: false,
      isError: false,
    };
    renderTab({ pr: { ...PR, files: [], files_count: 0 } });

    expect(screen.getByText("No changed files.")).toBeInTheDocument();
  });
});

describe("DiffTab — comments toggle", () => {
  it("hides finding cards together with comments but keeps the line's severity label and the file dot", () => {
    renderTab();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();

    // 0 GitHub comments + 3 current findings.
    fireEvent.click(screen.getByRole("button", { name: "Hide comments (3)" }));

    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Has review findings").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Show comments (3)" }));
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });
});

describe("DiffTab — no review yet", () => {
  it("explains that no review has run instead of showing empty counters", () => {
    reviewsData = [];
    renderTab();
    expect(screen.getByRole("status")).toHaveTextContent("No review has run on this PR yet");
    expect(screen.queryByLabelText(/files? with findings/)).not.toBeInTheDocument();
  });

  it("does not show the notice once a review exists", () => {
    renderTab();
    expect(screen.queryByText(/No review has run on this PR yet/)).not.toBeInTheDocument();
  });
});
