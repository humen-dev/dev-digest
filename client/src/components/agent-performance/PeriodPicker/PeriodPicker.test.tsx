import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { PeriodPicker } from "./PeriodPicker";

afterEach(cleanup);

function renderPicker(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PeriodPicker — SPEC-09 AC-4, AC-9", () => {
  it("lists the three options, fires presets and shows the validation error from a rejected custom range", () => {
    const onPreset = vi.fn();
    const onApplyCustom = vi.fn().mockReturnValueOnce("order").mockReturnValueOnce(null);
    renderPicker(<PeriodPicker state={{ range: "30d" }} onPreset={onPreset} onApplyCustom={onApplyCustom} />);

    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(onPreset).toHaveBeenCalledWith("1d");

    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApplyCustom).toHaveBeenCalledWith("2026-10-10", "2026-10-01");
    expect(screen.getByRole("alert")).toHaveTextContent("The start date must be on or before the end date.");

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("re-seeds the custom date inputs when the URL period changes (back/forward, preset)", () => {
    const props = { onPreset: vi.fn(), onApplyCustom: vi.fn().mockReturnValue(null) };
    const { rerender } = renderPicker(
      <PeriodPicker state={{ range: "custom", from: "2026-10-01", to: "2026-10-05" }} {...props} />,
    );
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");

    // Browser back to another custom range: inputs follow the URL, not the stale draft.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-20" } });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <PeriodPicker state={{ range: "custom", from: "2026-09-01", to: "2026-09-10" }} {...props} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-09-10");

    // Switch to a preset, then reopen Custom: no dates from the earlier range linger.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <PeriodPicker state={{ range: "30d" }} {...props} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
  });
});
