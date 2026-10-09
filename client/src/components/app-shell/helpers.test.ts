import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("matches the Onboarding Tour route but not the add-repo screen — SPEC-03 EC-24", () => {
    expect(activeKeyFor("/repos/acme-123/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/acme-123/tour/")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });

  it("still resolves the other repo-scoped and top-level routes", () => {
    expect(activeKeyFor("/repos/acme-123/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/acme-123/context")).toBe("context");
    expect(activeKeyFor("/repos/acme-123/conventions")).toBe("conventions");
    expect(activeKeyFor("/settings/api-keys")).toBe("settings");
    expect(activeKeyFor("/skills")).toBe("skills");
    expect(activeKeyFor("/agents")).toBe("agents");
    expect(activeKeyFor("/unknown")).toBe("");
  });
});

describe("Eval Dashboard nav — SPEC-05 AC-62", () => {
  it("lists the item in SKILLS LAB and resolves /eval to it", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    expect(lab?.items).toContainEqual({ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" });
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/agents/ag1")).toBe("eval");
  });
});
