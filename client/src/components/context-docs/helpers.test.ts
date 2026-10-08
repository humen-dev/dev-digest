import { describe, it, expect } from "vitest";
import type { EffectiveContextDoc, ProjectDocument } from "@devdigest/shared";
import {
  buildAgentContextRows,
  buildSkillContextRows,
  bucketHeading,
  compareBuckets,
  groupByBucket,
  isOverTokenThreshold,
  matchesFilter,
  moveAttached,
  reorderAttached,
} from "./helpers";

function doc(path: string, bucket: string, estimated_tokens = 10): ProjectDocument {
  return { path, bucket, estimated_tokens, used_by_agents: 0 };
}

describe("buildAgentContextRows", () => {
  const docs = [doc("a.md", "root"), doc("b.md", "root"), doc("insights/c.md", "insights")];

  it("orders attached docs first (attachment order), then the rest by path order — AC-17", () => {
    const rows = buildAgentContextRows(docs, ["b.md", "a.md"], undefined);
    expect(rows.map((r) => r.path)).toEqual(["b.md", "a.md", "insights/c.md"]);
    expect(rows[0]!.attached).toBe(true);
    expect(rows[2]!.attached).toBe(false);
  });

  it("marks an attached path 'skipped_missing' in the preview as missing — AC-26", () => {
    const preview: EffectiveContextDoc[] = [
      { path: "deleted.md", source: "agent", tokens: null, status: "skipped_missing", bucket: "root" },
    ];
    const rows = buildAgentContextRows(docs, ["deleted.md"], preview);
    expect(rows[0]).toMatchObject({ path: "deleted.md", attached: true, missing: true });
  });

  it("folds a skill-only path into the rest, marked inheritedVia — AC-24", () => {
    const preview: EffectiveContextDoc[] = [
      { path: "a.md", source: "skill:security-rubric", tokens: 12, status: "included", bucket: "root" },
    ];
    const rows = buildAgentContextRows(docs, [], preview);
    const inherited = rows.find((r) => r.path === "a.md")!;
    expect(inherited.attached).toBe(false);
    expect(inherited.inheritedVia).toBe("security-rubric");
  });
});

describe("buildSkillContextRows", () => {
  it("infers missing from absence in the current doc scan", () => {
    const docs = [doc("a.md", "root")];
    const rows = buildSkillContextRows(docs, ["a.md", "deleted.md"]);
    expect(rows.find((r) => r.path === "a.md")).toMatchObject({ attached: true, missing: false });
    expect(rows.find((r) => r.path === "deleted.md")).toMatchObject({ attached: true, missing: true });
  });
});

describe("matchesFilter", () => {
  const row = buildSkillContextRows([doc("insights/a.md", "insights")], [])[0]!;
  it("matches by path substring — AC-20", () => {
    expect(matchesFilter(row, "insights")).toBe(true);
    expect(matchesFilter(row, "perf")).toBe(false);
  });
  it("matches by folder — AC-20", () => {
    expect(matchesFilter(row, "insights")).toBe(true);
  });
  it("matches everything on an empty query", () => {
    expect(matchesFilter(row, "")).toBe(true);
  });
});

describe("moveAttached / reorderAttached", () => {
  it("moves an item down by index — AC-19", () => {
    expect(moveAttached(["a", "b"], 0, 1)).toEqual(["b", "a"]);
  });
  it("drops fromPath onto toPath", () => {
    expect(reorderAttached(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
  it("is a no-op for an out-of-range or identical move", () => {
    expect(moveAttached(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(reorderAttached(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});

describe("groupByBucket / compareBuckets", () => {
  it("orders specs, docs, insights, others A→Z, root last — AC-37", () => {
    const docs = [doc("README.md", "root"), doc("insights/a.md", "insights"), doc("server/b.md", "server"), doc("specs/c.md", "specs")];
    const groups = groupByBucket(docs);
    expect(groups.map((g) => g.bucket)).toEqual(["specs", "insights", "server", "root"]);
  });
  it("sorts equal buckets as equal", () => {
    expect(compareBuckets("docs", "docs")).toBe(0);
  });
});

describe("isOverTokenThreshold", () => {
  it("4,001 is over the budget, 4,000 is not — AC-25", () => {
    expect(isOverTokenThreshold(4001)).toBe(true);
    expect(isOverTokenThreshold(4000)).toBe(false);
  });
});

describe("bucketHeading", () => {
  it("matches reviewer-core's byte-exact bucket headings (plan §3.5)", () => {
    expect(bucketHeading("specs")).toBe("Project specifications");
    expect(bucketHeading("docs")).toBe("Project docs");
    expect(bucketHeading("insights")).toBe("Project insights");
    expect(bucketHeading("server")).toBe("Project server");
  });
});
