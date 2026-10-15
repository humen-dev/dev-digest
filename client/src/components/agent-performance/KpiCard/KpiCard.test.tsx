import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KpiCard } from "./KpiCard";

afterEach(cleanup);

describe("KpiCard", () => {
  it("renders skeletons without the value while loading, and the value with footer when loaded", () => {
    const { container, rerender } = render(<KpiCard label="Total runs" loading value="42" footer="note" />);
    expect(screen.getByText("Total runs")).toBeInTheDocument();
    expect(screen.queryByText("42")).toBeNull();
    expect(container.querySelector(".skeleton")).not.toBeNull();

    rerender(<KpiCard label="Total runs" loading={false} value="42" footer="note" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
  });
});
