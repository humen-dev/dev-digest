import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilterBar } from "./SeverityFilterBar";
import type { SeverityCounts } from "../FindingsTab/helpers";

afterEach(cleanup);

const COUNTS: SeverityCounts = { CRITICAL: 3, WARNING: 5, SUGGESTION: 2 };

function renderBar(props: Partial<React.ComponentProps<typeof SeverityFilterBar>> = {}) {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilterBar counts={COUNTS} active={null} onSelect={onSelect} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

describe("SeverityFilterBar", () => {
  it("renders a chip per severity with its count", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveTextContent("3 CRITICAL");
    expect(screen.getByRole("button", { name: /WARNING/ })).toHaveTextContent("5 WARNING");
    expect(screen.getByRole("button", { name: /SUGGESTION/ })).toHaveTextContent("2 SUGGESTION");
  });

  it("omits severities that have no findings", () => {
    renderBar({ counts: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 } });
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).toBeNull();
    expect(screen.getByRole("button", { name: /WARNING/ })).toHaveTextContent("1 WARNING");
  });

  it("selects a level on click", () => {
    const { onSelect } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/ }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clears the filter when the active level is clicked again", () => {
    const { onSelect } = renderBar({ active: "WARNING" });
    const warn = screen.getByRole("button", { name: /WARNING/ });
    expect(warn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(warn);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
