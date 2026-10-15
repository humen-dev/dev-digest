import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { RunsSparkline } from "./RunsSparkline";

afterEach(cleanup);

describe("RunsSparkline — SPEC-09 AC-58", () => {
  it("names the bucket size with the first and last counts, and survives a single bucket", () => {
    const wrap = (ui: React.ReactElement) => (
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        {ui}
      </NextIntlClientProvider>
    );
    const day = { size: "day" as const, buckets: [2, 0, 7].map((runs, i) => ({ start: `d${i}`, runs })) };
    const { container, rerender } = render(wrap(<RunsSparkline buckets={day} />));
    expect(screen.getByRole("img", { name: "Runs per day: first 2, last 7" })).toBeInTheDocument();

    rerender(wrap(<RunsSparkline buckets={{ size: "hour", buckets: [{ start: "h", runs: 4 }] }} />));
    expect(screen.getByRole("img", { name: "Runs per hour: first 4, last 4" })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("NaN");
  });
});
