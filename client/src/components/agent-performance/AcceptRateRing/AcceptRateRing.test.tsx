import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { AcceptRateRing } from "./AcceptRateRing";

afterEach(cleanup);

function renderRing(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AcceptRateRing — SPEC-09 AC-37, EC-8, NFR-6", () => {
  it("shows the whole percent with a named image, and a dash with 0 decisions", () => {
    renderRing(<AcceptRateRing accepted={11} decided={101} rate={11 / 101} />);
    expect(screen.getByRole("img", { name: "Accept rate 11%" })).toBeInTheDocument();
    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText("11 / 101 decisions")).toBeInTheDocument();

    cleanup();
    renderRing(<AcceptRateRing accepted={0} decided={0} rate={null} />);
    expect(screen.getByRole("img", { name: "Accept rate not available" })).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("0 decisions")).toBeInTheDocument();
  });
});
