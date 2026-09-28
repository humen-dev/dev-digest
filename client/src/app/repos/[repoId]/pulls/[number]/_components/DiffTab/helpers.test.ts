import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { buildRoleGroups, countFlaggedFiles, currentFindings, pathsWithFindings } from "./helpers";

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "file" | "review_id">): FindingRecord {
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

function review(over: Partial<ReviewRecord> & Pick<ReviewRecord, "id" | "agent_id" | "created_at" | "findings">): ReviewRecord {
  return {
    pr_id: "pr1",
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 50,
    model: "gpt",
    grounding: null,
    ...over,
  };
}

describe("currentFindings", () => {
  it("keeps only the newest review per agent, excludes dismissed, includes agent-less as one bucket", () => {
    const reviews: ReviewRecord[] = [
      // newest first (usePrReviews' order)
      review({
        id: "r-new",
        agent_id: "a1",
        created_at: "2026-09-27T12:00:00Z",
        findings: [
          finding({ id: "f1", file: "src/config.ts", review_id: "r-new" }),
          finding({ id: "f-dismissed", file: "src/config.ts", review_id: "r-new", dismissed_at: "2026-09-27T12:05:00Z" }),
        ],
      }),
      review({
        id: "r-old",
        agent_id: "a1",
        created_at: "2026-09-27T10:00:00Z",
        findings: [finding({ id: "f-superseded", file: "src/config.ts", review_id: "r-old" })],
      }),
      review({
        id: "r-b",
        agent_id: "a2",
        created_at: "2026-09-27T11:00:00Z",
        findings: [finding({ id: "f-b", file: "src/other.ts", review_id: "r-b" })],
      }),
      review({
        id: "r-summary",
        agent_id: null,
        kind: "summary",
        created_at: "2026-09-27T13:00:00Z",
        findings: [finding({ id: "f-summary", file: "src/config.ts", review_id: "r-summary" })],
      }),
      review({
        id: "r-none-1",
        agent_id: null,
        created_at: "2026-09-27T09:30:00Z",
        findings: [finding({ id: "f-none-old", file: "src/config.ts", review_id: "r-none-1" })],
      }),
    ];

    // r-summary (kind='summary') never counts, so r-none-1 — the only
    // kind='review' entry with a null agent — is the one bucket that stays.
    const ids = currentFindings(reviews).map((f) => f.id);
    expect(ids.sort()).toEqual(["f-b", "f-none-old", "f1"].sort());
  });
});

describe("buildRoleGroups", () => {
  const files: PrFile[] = [
    { path: "src/config.ts", additions: 4, deletions: 0, patch: null },
    { path: "src/index.ts", additions: 1, deletions: 0, patch: null },
    { path: "README.md", additions: 2, deletions: 0, patch: null },
    { path: "src/new-file.ts", additions: 3, deletions: 0, patch: null },
  ];
  const smartDiff: SmartDiffResponse = {
    groups: [
      { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "docs", files: [{ path: "README.md", additions: 2, deletions: 0, finding_lines: [] }] },
      { role: "core", files: [{ path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [] },
  };

  it("orders groups by SmartDiffRole order, keeps pr.files order inside a group, omits empty groups, and puts an unknown path in core", () => {
    const groups = buildRoleGroups(files, smartDiff);
    expect(groups.map((g) => g.role)).toEqual(["core", "wiring", "docs"]);
    const core = groups.find((g) => g.role === "core")!;
    expect(core.files.map((f) => f.path)).toEqual(["src/config.ts", "src/new-file.ts"]);
  });
});

describe("pathsWithFindings / countFlaggedFiles", () => {
  it("counts 2 files as flagged for 3 findings across 2 files", () => {
    const findings: FindingRecord[] = [
      finding({ id: "f1", file: "src/config.ts", review_id: "r1" }),
      finding({ id: "f2", file: "src/config.ts", review_id: "r1" }),
      finding({ id: "f3", file: "src/utils.ts", review_id: "r1" }),
    ];
    const paths = pathsWithFindings(findings);
    const files: PrFile[] = [
      { path: "src/config.ts", additions: 1, deletions: 0, patch: null },
      { path: "src/utils.ts", additions: 1, deletions: 0, patch: null },
      { path: "src/index.ts", additions: 1, deletions: 0, patch: null },
    ];
    expect(countFlaggedFiles(files, paths)).toBe(2);
  });
});

describe("buildRoleGroups — unknown role", () => {
  it("puts files whose role the client does not know into core instead of dropping them", () => {
    const files: PrFile[] = [{ path: "src/x.ts", additions: 1, deletions: 0, patch: null }];
    const smartDiff = {
      groups: [{ role: "generated-by-newer-server", files: [{ path: "src/x.ts", additions: 1, deletions: 0, finding_lines: [] }] }],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    } as unknown as SmartDiffResponse;

    expect(buildRoleGroups(files, smartDiff)).toEqual([{ role: "core", files }]);
  });
});
