import { describe, it, expect } from "vitest";
import type { OnboardingTour } from "@devdigest/shared";
import { buildTourMarkdown, isIndexReady, notReadyReason, sha7, totalDropped } from "./helpers";

describe("isIndexReady / notReadyReason — EC-34, EC-35", () => {
  it("full and partial are ready; everything else maps to its reason", () => {
    expect(isIndexReady("full")).toBe(true);
    expect(isIndexReady("partial")).toBe(true);
    expect(isIndexReady("degraded")).toBe(false);
    expect(isIndexReady("failed")).toBe(false);
    expect(isIndexReady(null)).toBe(false);

    expect(notReadyReason(null)).toBe("notIndexed");
    expect(notReadyReason("failed")).toBe("failed");
    expect(notReadyReason("degraded")).toBe("other");
  });
});

describe("totalDropped — AC-55", () => {
  it("sums the dropped counter of all four countable sections", () => {
    expect(
      totalDropped({
        critical_paths: { proposed: 5, dropped: 1 },
        how_to_run: { proposed: 2, dropped: 0 },
        guided_reading: { proposed: 3, dropped: 2 },
        first_tasks: { proposed: 1, dropped: 0 },
      }),
    ).toBe(3);
  });
});

describe("sha7", () => {
  it("cuts a commit to its short form", () => {
    expect(sha7("abcdef1234567")).toBe("abcdef1");
  });
});

describe("buildTourMarkdown — AC-64, Markdown export", () => {
  const TOUR: OnboardingTour = {
    repo_id: "repo-1",
    tour_commit: "abc12349999",
    generated_at: new Date().toISOString(),
    tracked_file_count: 42,
    indexed_file_count: 42,
    model: "deepseek/deepseek-v4-flash",
    api_cost_usd: 0.01,
    duration_ms: 4000,
    architecture: {
      overview: "The gateway boots from src/server.ts.",
      overview_paths: ["src/server.ts"],
      diagram: "flowchart LR\n  A --> B",
    },
    critical_paths: [{ path: "src/server.ts", note: "App bootstrap", importer_count: 1 }],
    how_to_run: [
      { command: "pnpm install", note: null, source: "package.json" },
      { command: "pnpm dev", note: "starts the dev server", source: "package.json" },
    ],
    guided_reading: [{ path: "src/server.ts", reason: "Start here", importer_count: null }],
    first_tasks: [{ title: "Add a probe", target: "src/health.ts", complexity: "low", new_file: true }],
    counters: {
      critical_paths: { proposed: 1, dropped: 0 },
      how_to_run: { proposed: 2, dropped: 0 },
      guided_reading: { proposed: 1, dropped: 0 },
      first_tasks: { proposed: 1, dropped: 0 },
    },
  };

  const TITLES = {
    architecture_overview: "Architecture overview",
    critical_paths: "Critical paths",
    how_to_run: "How to run locally",
    guided_reading: "Guided reading path",
    first_tasks: "First tasks",
  } as const;

  it("builds the document in catalogue order with the diagram in a mermaid fence", () => {
    const md = buildTourMarkdown(TOUR, "widgets", TITLES, "Nothing verified for this section.");

    expect(md).toBe(
      [
        "# Onboarding for widgets",
        "",
        "Generated from 42 files at abc1234",
        "",
        "## Architecture overview",
        "",
        "The gateway boots from src/server.ts.",
        "",
        "```mermaid",
        "flowchart LR\n  A --> B",
        "```",
        "",
        "## Critical paths",
        "",
        "- `src/server.ts` — App bootstrap",
        "",
        "## How to run locally",
        "",
        "```sh",
        "pnpm install",
        "pnpm dev # starts the dev server",
        "```",
        "",
        "## Guided reading path",
        "",
        "1. `src/server.ts` — Start here",
        "",
        "## First tasks",
        "",
        "- **Add a probe** — `src/health.ts` (low)",
      ].join("\n"),
    );
  });

  it("falls back to the empty-section text instead of a bare heading — EC-15", () => {
    const empty: OnboardingTour = { ...TOUR, critical_paths: [], architecture: { ...TOUR.architecture, overview: "" } };
    const md = buildTourMarkdown(empty, "widgets", TITLES, "Nothing verified for this section.");
    expect(md).toContain("## Architecture overview\n\nNothing verified for this section.");
    expect(md).toContain("## Critical paths\n\nNothing verified for this section.");
  });
});
