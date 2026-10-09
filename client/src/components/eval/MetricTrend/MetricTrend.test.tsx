import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { MetricTrend } from "./MetricTrend";

afterEach(cleanup);

const POINTS: EvalTrendPoint[] = [
  {
    run_id: "r1",
    ran_at: "2026-10-08T09:00:00.000Z",
    agent_version: 1,
    recall: 0.5,
    precision: null,
    citation_accuracy: 1,
    cases_passed: 2,
    cases_total: 4,
  },
  {
    run_id: "r2",
    ran_at: "2026-10-09T09:00:00.000Z",
    agent_version: 2,
    recall: 0.75,
    precision: 0.6,
    citation_accuracy: 1,
    cases_passed: 3,
    cases_total: 4,
  },
];

describe("MetricTrend", () => {
  it("hides the chart from assistive tech and exposes the same values as a table", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <MetricTrend points={POINTS} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    const table = screen.getByRole("table", { name: "Trend as a table" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("n/a")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("50%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("75%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("3 / 4 passing")).toBeInTheDocument();
  });
});
