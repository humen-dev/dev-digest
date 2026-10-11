import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBanner } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/eval.json";
import { InsightBanner } from "./InsightBanner";

afterEach(cleanup);

const BANNER: EvalBanner = {
  metric: "recall",
  direction: "down",
  points: 8,
  agent_version: 3,
  transitions: [{ case_id: "c1", name: "stripe-key-leak", from: "pass", to: "fail" }],
};

function renderBanner(banner: EvalBanner | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <InsightBanner banner={banner} />
    </NextIntlClientProvider>,
  );
}

describe("InsightBanner", () => {
  it("names the metric, move, version and changed cases; drops the causal clause without cases; renders nothing for null or a 0 pt move", () => {
    const { unmount } = renderBanner(BANNER);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Recall dipped 8 pts on v3 · cases that changed: stripe-key-leak",
    );
    unmount();

    const { unmount: u2 } = renderBanner({ ...BANNER, direction: "up", points: 1, transitions: [] });
    expect(screen.getByRole("note").textContent).toBe("Recall rose 1 pt on v3");
    u2();

    const { container, unmount: u3 } = renderBanner(null);
    expect(container).toBeEmptyDOMElement();
    u3();

    const { container: c4 } = renderBanner({ ...BANNER, points: 0.04 });
    expect(c4).toBeEmptyDOMElement();
  });
});
