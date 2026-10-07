import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

function renderFocus(items: ReviewFocusItem[], onNavigate = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <ReviewFocus items={items} onNavigate={onNavigate} />
    </NextIntlClientProvider>,
  );
  return onNavigate;
}

afterEach(cleanup);

describe("ReviewFocus", () => {
  it("lists items in order with count badge and navigates on click", () => {
    const onNavigate = renderFocus([
      { file: "src/a.ts", line: 12, reason: "<i>core</i> change" },
      { file: "src/b.ts", line: null, reason: "new module" },
    ]);

    expect(screen.getByRole("heading", { name: "Review focus — read these first" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("src/a.ts:12— <i>core</i> change");
    expect(buttons[1]).toHaveTextContent("src/b.ts— new module");
    expect(screen.getByText("2")).toBeInTheDocument();

    // Native <button>s: Enter/Space activation and focusability come from the browser.
    fireEvent.click(buttons[0]!);
    expect(onNavigate).toHaveBeenCalledWith({ file: "src/a.ts", line: 12 });

    fireEvent.click(buttons[1]!);
    expect(onNavigate).toHaveBeenLastCalledWith({ file: "src/b.ts", line: null });
  });

  it("shows the empty text", () => {
    renderFocus([]);
    expect(screen.getByText("No review focus items.")).toBeInTheDocument();
  });
});
