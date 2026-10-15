import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { CostNotes } from "./CostNotes";

afterEach(cleanup);

function renderNotes(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CostNotes — SPEC-09 AC-51..AC-53, AC-72", () => {
  it("always shows the provider label and the other notes only when they apply", () => {
    renderNotes(<CostNotes unpricedRuns={2} pricedCiRuns={1} />);
    expect(screen.getByText("Provider-reported, not reconciled with billing")).toBeInTheDocument();
    expect(screen.getByText("2 runs without a reported cost are not included")).toBeInTheDocument();
    expect(screen.getByText("Includes CI runs whose cost may be an estimate")).toBeInTheDocument();

    cleanup();
    renderNotes(<CostNotes unpricedRuns={0} pricedCiRuns={0} />);
    expect(screen.getByText("Provider-reported, not reconciled with billing")).toBeInTheDocument();
    expect(screen.queryByText(/without a reported cost/)).toBeNull();
    expect(screen.queryByText(/CI runs/)).toBeNull();
  });
});
