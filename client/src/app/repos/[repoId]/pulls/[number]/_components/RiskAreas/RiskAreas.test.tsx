import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";

const info = vi.fn();
vi.mock("@/lib/toast", () => ({ notify: { info: (m: string) => info(m) } }));

import { RiskAreas } from "./RiskAreas";
import { RISK_KINDS, RISK_KIND_ICON } from "./constants";
import { parseFileRef, sortRisks } from "./helpers";

const risk = (over: Partial<Risk>): Risk => ({
  kind: "other",
  title: "T",
  explanation: "E",
  severity: "low",
  file_refs: [],
  ...over,
});

function renderRisks(risks: Risk[], onNavigate = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <RiskAreas risks={risks} changedPaths={new Set(["src/a.ts"])} onNavigate={onNavigate} />
    </NextIntlClientProvider>,
  );
  return onNavigate;
}

afterEach(() => {
  cleanup();
  info.mockClear();
});

describe("helpers", () => {
  it("sorts high to low, stable within a severity", () => {
    const out = sortRisks([
      risk({ title: "l1", severity: "low" }),
      risk({ title: "h1", severity: "high" }),
      risk({ title: "m1", severity: "medium" }),
      risk({ title: "h2", severity: "high" }),
      risk({ title: "l2", severity: "low" }),
    ]);
    expect(out.map((r) => r.title)).toEqual(["h1", "h2", "m1", "l1", "l2"]);
  });

  it("parses file refs", () => {
    expect(parseFileRef("src/a.ts:12-20")).toEqual({ file: "src/a.ts", line: 12 });
    expect(parseFileRef("src/a.ts:7")).toEqual({ file: "src/a.ts", line: 7 });
    expect(parseFileRef("src/a.ts")).toEqual({ file: "src/a.ts", line: null });
  });

  it("maps every vocabulary kind to an icon", () => {
    for (const k of RISK_KINDS) expect(RISK_KIND_ICON[k]).toBeTruthy();
  });
});

describe("RiskAreas", () => {
  it("shows title and first ref, navigates on changed files, toasts otherwise", () => {
    const onNavigate = renderRisks([
      risk({ title: "Low one", severity: "low", file_refs: ["src/blast.ts:3"] }),
      risk({ title: "High one", severity: "high", file_refs: ["src/a.ts:12-20", "src/a.ts:40"] }),
    ]);

    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    const titles = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(titles[0]).toContain("High one");

    fireEvent.click(screen.getByRole("button", { name: /High one/ }));
    expect(onNavigate).toHaveBeenCalledWith({ file: "src/a.ts", line: 12 });

    fireEvent.click(screen.getByRole("button", { name: /Low one/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("File not in this PR's diff");
  });

  it("expands via the chevron and renders HTML as text", () => {
    renderRisks([
      risk({ severity: "high", explanation: "<b>bold</b> why", file_refs: ["src/a.ts:1", "src/a.ts:2"] }),
    ]);
    const toggle = screen.getByRole("button", { name: "Show details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("<b>bold</b> why")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "src/a.ts:2" })).toHaveLength(1);
  });

  it("shows the empty text", () => {
    renderRisks([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
