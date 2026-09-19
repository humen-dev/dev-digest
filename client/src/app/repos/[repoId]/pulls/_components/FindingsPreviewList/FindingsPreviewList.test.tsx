import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Finding } from "@devdigest/shared";
import { FindingsPreviewList } from "./FindingsPreviewList";

afterEach(cleanup);

const mk = (id: string, severity: Finding["severity"], title: string): Finding => ({
  id,
  severity,
  category: "bug",
  title,
  file: "src/a.ts",
  start_line: 5,
  end_line: 5,
  rationale: "because reasons",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
});

describe("FindingsPreviewList", () => {
  it("renders the title, each finding, file:line and confidence", () => {
    render(
      <FindingsPreviewList
        findings={[mk("1", "SUGGESTION", "Sugg one"), mk("2", "CRITICAL", "Crit one")]}
        title="2 findings"
      />,
    );
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Sugg one")).toBeInTheDocument();
    expect(screen.getAllByText("src/a.ts:5")).toHaveLength(2);
    expect(screen.getAllByText("90% conf")).toHaveLength(2);
  });

  it("sorts findings by severity (CRITICAL before SUGGESTION)", () => {
    const { container } = render(
      <FindingsPreviewList
        findings={[mk("1", "SUGGESTION", "Sugg one"), mk("2", "CRITICAL", "Crit one")]}
        title="2 findings"
      />,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("Crit one")).toBeLessThan(text.indexOf("Sugg one"));
  });
});
