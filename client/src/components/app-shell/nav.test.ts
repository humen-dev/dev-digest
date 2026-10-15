import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";

describe("Agent Performance nav — SPEC-09 AC-1", () => {
  it("sits in GLOBAL between Multi-Agent Review and CI Runs", () => {
    const global = NAV.find((g) => g.section === "GLOBAL");
    expect(global?.items.map((i) => i.key)).toEqual(["multi-agent", "agent-performance", "ci-runs"]);
    expect(global?.items[1]).toMatchObject({ label: "Agent Performance", href: "/agent-performance" });
  });
});
