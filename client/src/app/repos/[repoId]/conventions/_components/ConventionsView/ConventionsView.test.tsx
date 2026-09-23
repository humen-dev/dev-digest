import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionBoard, ConventionCandidate, ConventionScan } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const extract = vi.fn();
const bulkMutate = vi.fn();
const updateMutate = vi.fn();
let board: ConventionBoard;

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: {
      id: "r1",
      name: "payments-api",
      full_name: "humen-dev/payments-api",
      default_branch: "main",
    },
  }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: board, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extract, isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
  useBulkUpdateConventions: () => ({ mutate: bulkMutate, isPending: false }),
}));

// The modal fetches its own draft and embeds the skill body editor; the board
// only owns whether it is open.
vi.mock("../CreateSkillFromConventionsModal", () => ({
  CreateSkillFromConventionsModal: () => <div>create-skill-modal</div>,
}));

import { ConventionsView } from "./ConventionsView";

const candidate = (
  id: string,
  status: ConventionCandidate["status"],
  over: Partial<ConventionCandidate> = {},
): ConventionCandidate => ({
  id,
  repo_id: "r1",
  rule: `rule ${id}`,
  rationale: null,
  category: "style",
  evidence_path: `src/${id}.ts`,
  evidence_line: 10,
  evidence_snippet: "const a = 1;",
  occurrences: 3,
  confidence: 0.9,
  status,
  created_at: "2026-09-23T10:00:00Z",
  ...over,
});

const SCAN: ConventionScan = {
  id: "scan1",
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  sampled_files: ["a.ts", "b.ts", "c.ts"],
  proposed: 9,
  dropped_ungrounded: 2,
  dropped_duplicate: 1,
  dropped_rare: 1,
  kept: 5,
  model: "deepseek/deepseek-v4-flash",
  api_cost_usd: 0.00004,
  head_sha: "abc123",
  duration_ms: 31_000,
};

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  board = { candidates: [], last_scan: null };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConventionsView", () => {
  it("offers Run Scan and an empty state before the first scan", () => {
    renderView();
    expect(screen.getAllByText("Run Scan")).toHaveLength(2); // header + empty-state CTA
    expect(screen.queryByText("Re-scan")).not.toBeInTheDocument();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Run Scan")[0]!);
    expect(extract).toHaveBeenCalled();
  });

  it("switches to Re-scan and shows the scan summary once a scan exists", () => {
    board = { candidates: [candidate("1", "pending")], last_scan: SCAN };
    renderView();
    expect(screen.getByText("Re-scan")).toBeInTheDocument();
    expect(screen.queryByText("Run Scan")).not.toBeInTheDocument();
    expect(screen.getByText(/Detected from 3 sample files · last scan 1h ago/)).toBeInTheDocument();
    expect(
      screen.getByText("9 proposed · 2 dropped without evidence · 1 duplicates · 1 single-file · 5 kept"),
    ).toBeInTheDocument();
    expect(screen.getByText(/deepseek\/deepseek-v4-flash · \$0\.000040/)).toBeInTheDocument();
  });

  it("hides Create skill until something is accepted", () => {
    board = { candidates: [candidate("1", "pending")], last_scan: SCAN };
    renderView();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
    expect(screen.queryByText("Create skill")).not.toBeInTheDocument();
  });

  it("opens the create-skill modal when at least one is accepted", () => {
    board = { candidates: [candidate("1", "accepted"), candidate("2", "pending")], last_scan: SCAN };
    renderView();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create skill"));
    expect(screen.getByText("create-skill-modal")).toBeInTheDocument();
  });

  it("deselects all accepted candidates in one request", () => {
    board = { candidates: [candidate("1", "accepted"), candidate("2", "accepted")], last_scan: SCAN };
    renderView();
    fireEvent.click(screen.getByText("Deselect all"));
    expect(bulkMutate).toHaveBeenCalledWith({ ids: ["1", "2"], status: "pending" });
  });

  it("keeps rejected candidates out of the list until the section is expanded", () => {
    board = { candidates: [candidate("1", "pending"), candidate("2", "rejected")], last_scan: SCAN };
    renderView();
    expect(screen.queryByText("rule 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Rejected (1)"));
    expect(screen.getByText("rule 2")).toBeInTheDocument();
    expect(screen.getByText(/Rejected rules never reach a skill/)).toBeInTheDocument();
  });
});
