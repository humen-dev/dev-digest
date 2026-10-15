import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { SmallSampleBadge } from "./SmallSampleBadge";

afterEach(cleanup);

function renderBadge(decided: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <SmallSampleBadge decided={decided} />
    </NextIntlClientProvider>,
  );
}

describe("SmallSampleBadge — SPEC-09 AC-41, AC-73", () => {
  it("shows for 3 decided and not for 0 or 5", () => {
    renderBadge(3);
    expect(screen.getByText("Small sample (n=3)")).toBeInTheDocument();
    cleanup();
    expect(renderBadge(0).container).toBeEmptyDOMElement();
    cleanup();
    expect(renderBadge(5).container).toBeEmptyDOMElement();
  });
});
