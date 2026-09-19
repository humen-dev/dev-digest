import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings } from "./helpers";

function mk(id: string, severity: FindingRecord["severity"], confidence: number): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [
  mk("sugg", "SUGGESTION", 0.9),
  mk("crit", "CRITICAL", 0.5),
  mk("warn", "WARNING", 0.8),
];

describe("visibleFindings", () => {
  it("sorts by severity (CRITICAL first) with no filters", () => {
    expect(visibleFindings(FINDINGS, false).map((f) => f.id)).toEqual(["crit", "warn", "sugg"]);
  });

  it("drops low-confidence findings when hideLow is on", () => {
    expect(visibleFindings(FINDINGS, true).map((f) => f.id)).toEqual(["warn", "sugg"]);
  });

  it("restricts to the given severity", () => {
    expect(visibleFindings(FINDINGS, false, "WARNING").map((f) => f.id)).toEqual(["warn"]);
  });

  it("composes severity filter with hideLow", () => {
    // CRITICAL exists but is low-confidence → hidden by hideLow
    expect(visibleFindings(FINDINGS, true, "CRITICAL")).toEqual([]);
  });
});
