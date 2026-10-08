import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { TourNotices } from "./TourNotices";

afterEach(cleanup);

function renderNotices(overrides: Partial<Parameters<typeof TourNotices>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourNotices
        stale={false}
        tourCommit="aaaaaaa1111"
        currentCommit="bbbbbbb2222"
        onRegenerate={vi.fn()}
        regenerating={false}
        conflict={false}
        errorMessage={null}
        onRetry={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe("TourNotices", () => {
  it("renders nothing when the tour is fresh, no generation is in flight and nothing failed", () => {
    const { container } = renderNotices();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the stale banner with both short commits and sends one generate request — AC-68", () => {
    const onRegenerate = vi.fn();
    renderNotices({ stale: true, onRegenerate });

    expect(
      screen.getByText("This tour was generated from index aaaaaaa; the index is now at bbbbbbb."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("shows the in-progress notice on a 409 — EC-8", () => {
    renderNotices({ conflict: true });
    expect(screen.getByText("A tour generation is already running for this repository.")).toBeInTheDocument();
  });

  it("shows the failure message with Retry above the stored tour — EC-11", () => {
    const onRetry = vi.fn();
    renderNotices({ errorMessage: "external_service_error: provider down", onRetry });

    expect(screen.getByText("external_service_error: provider down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the failure notice but shows a disabled 'Generating…' instead of Retry while a generation is still in flight — M-3", () => {
    renderNotices({ errorMessage: "generation_timeout: timed out", regenerating: true });

    expect(screen.getByText("generation_timeout: timed out")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Generating…" });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
