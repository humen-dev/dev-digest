import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunMetrics } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { MetricTiles } from "./MetricTiles";

afterEach(cleanup);

const METRICS: EvalRunMetrics = {
  recall: 0.75,
  precision: null,
  citation_accuracy: 1,
  cases_passed: 3,
  cases_total: 4,
  cases_errored: 0,
  uncovered_findings: 0,
};

function renderTiles(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MetricTiles", () => {
  it("shows percentages, n/a for a null metric, passed count and signed point deltas", () => {
    renderTiles(<MetricTiles metrics={METRICS} deltas={{ recall: 0.05, citation_accuracy: -0.1 }} />);
    expect(within(screen.getByTestId("metric-recall")).getByText("75%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-recall")).getByText("+5 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-precision")).getByText("n/a")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-citation_accuracy")).getByText("−10 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-cases_passed")).getByText("3 / 4")).toBeInTheDocument();
  });

  it("renders n/a on every tile when there is no run yet", () => {
    renderTiles(<MetricTiles metrics={null} />);
    expect(screen.getAllByText("n/a")).toHaveLength(4);
  });
});
