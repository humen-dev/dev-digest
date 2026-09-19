import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Finding } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

const mk = (id: string, severity: Finding["severity"]): Finding => ({
  id,
  severity,
  category: "bug",
  title: `t-${id}`,
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
});

function renderCell(findings: Finding[] | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell findings={findings} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("renders per-severity counts", () => {
    renderCell([mk("1", "CRITICAL"), mk("2", "WARNING"), mk("3", "WARNING")]);
    // critical = 1, warning = 2 (suggestion absent → no badge)
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows an em dash when there are no findings", () => {
    renderCell([]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em dash when findings is null (never reviewed)", () => {
    renderCell(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
