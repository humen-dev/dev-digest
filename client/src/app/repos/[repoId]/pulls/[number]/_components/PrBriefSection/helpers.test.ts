import { describe, it, expect } from "vitest";
import type { BriefContextCandidate, BriefProvenance, ReviewRecord, Settings } from "@devdigest/shared";
import {
  effectiveSelection,
  latestReview,
  missingKeyProvider,
  outcomeReasonKey,
  parseMissingSource,
  regenerateBody,
  searchProjectDocs,
  toggleSelection,
} from "./helpers";

const review = (id: string, kind: "review" | "summary", created_at: string) =>
  ({ id, kind, created_at, findings: [] }) as unknown as ReviewRecord;

describe("PrBriefSection helpers", () => {
  it("latestReview picks the newest kind:'review' record and ignores summaries — AC-46, AC-47", () => {
    const list = [
      review("old", "review", "2026-10-01T00:00:00Z"),
      review("new", "review", "2026-10-05T00:00:00Z"),
      review("sum", "summary", "2026-10-06T00:00:00Z"),
    ];
    expect(latestReview(list)?.id).toBe("new");
    expect(latestReview([review("sum", "summary", "2026-10-06T00:00:00Z")])).toBeNull();
    expect(latestReview(undefined)).toBeNull();
  });

  it("regenerateBody replays the recorded context documents — AC-67", () => {
    const provenance = {
      context_docs: [
        { path: "specs/a.md", status: "ok", tokens: 10 },
        { path: "docs/b.md", status: "ok", tokens: null },
      ],
    } as unknown as BriefProvenance;
    expect(regenerateBody(provenance)).toEqual({ regenerate: true, context_paths: ["specs/a.md", "docs/b.md"] });
  });

  it("resolves the risk_brief provider from settings, else the registry default — AC-72", () => {
    const secrets = { openai: false, anthropic: true, openrouter: true, github: true };
    expect(missingKeyProvider(undefined, secrets)).toBe("openai");
    const override = { feature_models: { risk_brief: { provider: "anthropic", model: "x" } } } as unknown as Settings;
    expect(missingKeyProvider(override, secrets)).toBeNull();
    expect(missingKeyProvider(undefined, undefined)).toBeNull();
  });

  it("classifies missing sources and outcome reasons without inventing i18n keys", () => {
    expect(parseMissingSource("intent_not_detected")).toEqual({ kind: "known", key: "intent_not_detected" });
    expect(parseMissingSource("blast_degraded:no_data")).toEqual({ kind: "degraded", reason: "no_data" });
    expect(parseMissingSource("weird")).toEqual({ kind: "unknown", raw: "weird" });
    expect(outcomeReasonKey("refused", "over_budget")).toBe("refused.over_budget");
    expect(outcomeReasonKey("failed", "timeout")).toBe("failed.reason.timeout");
    expect(outcomeReasonKey("failed", "nope")).toBeNull();
  });

  it("selection helpers start from the preselection and toggle / search by path", () => {
    const candidates = [
      { path: "a.md", preselected: true },
      { path: "b.md", preselected: false },
    ] as BriefContextCandidate[];
    expect(effectiveSelection(candidates, null)).toEqual(["a.md"]);
    expect(effectiveSelection(candidates, ["b.md"])).toEqual(["b.md"]);
    expect(toggleSelection(["a.md"], "a.md")).toEqual([]);
    expect(toggleSelection(["a.md"], "b.md")).toEqual(["a.md", "b.md"]);

    const docs = [{ path: "docs/Extra.md" }, { path: "docs/other.md" }, { path: "x/extra2.md" }];
    expect(searchProjectDocs(docs, "EXTRA", new Set(["x/extra2.md"]), 8)).toEqual([{ path: "docs/Extra.md" }]);
    expect(searchProjectDocs(docs, "  ", new Set(), 8)).toEqual([]);
  });
});
