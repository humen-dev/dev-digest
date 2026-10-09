import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrendSparkline } from "./TrendSparkline";

afterEach(cleanup);

describe("TrendSparkline", () => {
  it("wraps the svg in aria-hidden, survives a single point and renders nothing for all-null", () => {
    const { container, rerender } = render(<TrendSparkline data={[0.5]} />);
    const wrap = screen.getByTestId("trend-sparkline");
    expect(wrap).toHaveAttribute("aria-hidden", "true");
    expect(wrap.querySelector("svg")).not.toBeNull();
    expect(container.innerHTML).not.toContain("NaN");

    rerender(<TrendSparkline data={[null, null]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
