import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { CostDelta } from "./CostDelta";

afterEach(cleanup);

function renderDelta(current: number | null, previous: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <CostDelta current={current} previous={previous} />
    </NextIntlClientProvider>,
  );
}

describe("CostDelta — SPEC-09 AC-57, AC-74, AC-54, EC-15", () => {
  it("colours a decrease ok and an increase crit, and hides when a value is missing", () => {
    renderDelta(1, 2.2);
    expect(screen.getByText("−$1.200 vs previous period")).toHaveStyle({ color: "var(--ok)" });
    cleanup();
    renderDelta(1.5, 1);
    expect(screen.getByText("+$0.500 vs previous period")).toHaveStyle({ color: "var(--crit)" });
    cleanup();
    expect(renderDelta(null, 1).container).toBeEmptyDOMElement();
    cleanup();
    expect(renderDelta(1, null).container).toBeEmptyDOMElement();
  });
});
