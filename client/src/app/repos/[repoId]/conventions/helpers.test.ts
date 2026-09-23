import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  acceptedIds,
  confidenceColor,
  confidencePercent,
  evidenceLabel,
  evidenceRange,
  pendingIds,
  splitCandidates,
} from "./helpers";

const c = (id: string, status: ConventionCandidate["status"], over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  repo_id: "r",
  rule: `rule ${id}`,
  rationale: null,
  category: "style",
  evidence_path: "src/a.ts",
  evidence_line: 23,
  evidence_snippet: "a\nb\nc",
  occurrences: null,
  confidence: 0.9,
  status,
  created_at: "2026-09-23T00:00:00Z",
  ...over,
});

describe("conventions helpers", () => {
  const list = [c("1", "accepted"), c("2", "pending"), c("3", "rejected")];

  it("splits active (pending + accepted) from rejected", () => {
    const { active, rejected } = splitCandidates(list);
    expect(active.map((x) => x.id)).toEqual(["1", "2"]);
    expect(rejected.map((x) => x.id)).toEqual(["3"]);
  });

  it("collects accepted / pending ids", () => {
    expect(acceptedIds(list)).toEqual(["1"]);
    expect(pendingIds(list)).toEqual(["2"]);
  });

  it("derives the evidence line range from the snippet", () => {
    expect(evidenceRange(list[0]!)).toEqual({ start: 23, end: 25 });
    expect(evidenceLabel(list[0]!)).toBe("src/a.ts:23-25");
    expect(evidenceLabel(c("4", "pending", { evidence_line: 1, evidence_snippet: "one line" }))).toBe("src/a.ts:1");
  });

  it("maps confidence to a percent and a colour band", () => {
    expect(confidencePercent(0.914)).toBe(91);
    expect(confidencePercent(1.7)).toBe(100);
    expect(confidenceColor(91)).toBe("var(--ok)");
    expect(confidenceColor(78)).toBe("var(--warn)");
    expect(confidenceColor(40)).toBe("var(--text-muted)");
  });
});
