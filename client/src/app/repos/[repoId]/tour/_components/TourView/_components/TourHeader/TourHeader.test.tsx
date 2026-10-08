import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { OnboardingTour, TourSectionKind } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import { TourHeader } from "./TourHeader";

afterEach(cleanup);

const TOUR: OnboardingTour = {
  repo_id: "repo-1",
  tour_commit: "sha1234567",
  generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  tracked_file_count: 1201,
  indexed_file_count: 1180,
  model: "deepseek/deepseek-v4-flash",
  api_cost_usd: null,
  duration_ms: 41000,
  architecture: { overview: "Overview text", overview_paths: [], diagram: null },
  critical_paths: [{ path: "src/server.ts", note: "Boot", importer_count: null }],
  how_to_run: [],
  guided_reading: [],
  first_tasks: [],
  counters: {
    critical_paths: { proposed: 1, dropped: 1 },
    how_to_run: { proposed: 0, dropped: 1 },
    guided_reading: { proposed: 0, dropped: 1 },
    first_tasks: { proposed: 0, dropped: 0 },
  },
};

const TITLES: Record<TourSectionKind, string> = {
  architecture_overview: "Architecture overview",
  critical_paths: "Critical paths",
  how_to_run: "How to run locally",
  guided_reading: "Guided reading path",
  first_tasks: "First tasks",
};

function renderHeader(overrides: Partial<Parameters<typeof TourHeader>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <TourHeader
          tour={TOUR}
          cloned
          generating={false}
          onRegenerate={vi.fn()}
          repoId="repo-1"
          repoName="widgets"
          activeKind="critical_paths"
          sectionTitles={TITLES}
          {...overrides}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("TourHeader", () => {
  it("shows the subtitle with the indexed-count addendum and sends one generate request — AC-10, AC-11, AC-30", () => {
    const onRegenerate = vi.fn();
    renderHeader({ onRegenerate });

    expect(
      screen.getByText("Generated from 1,201 files · last refreshed 2h ago · indexed 1,180"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("omits the indexed addendum when the counts are equal", () => {
    renderHeader({ tour: { ...TOUR, indexed_file_count: TOUR.tracked_file_count } });
    expect(screen.getByText("Generated from 1,201 files · last refreshed 2h ago")).toBeInTheDocument();
  });

  it("shows 'Generating…' with no enabled action while pending — AC-32", () => {
    renderHeader({ generating: true });
    const btn = screen.getByRole("button", { name: "Generating…" });
    expect(btn).toBeDisabled();
  });

  it("disables Regenerate with the clone hint when there is no clone — EC-2", () => {
    renderHeader({ cloned: false });
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("Clone the repository to regenerate")).toBeInTheDocument();
  });

  it("copies the share URL of the highlighted section and toasts — AC-63", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    Object.defineProperty(window, "location", { value: { origin: "http://localhost:3000" }, writable: true });

    renderHeader({ activeKind: "how_to_run" });
    const shareButton = screen.getByRole("button", { name: "Share link to the How to run locally section" });
    expect(shareButton).toHaveTextContent("Share link");
    fireEvent.click(shareButton);
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/repos/repo-1/tour#how_to_run");
    expect(
      await screen.findByText("Link copied — opens on machines running DevDigest with this repo imported"),
    ).toBeInTheDocument();
  });

  it("names the Share button after the currently highlighted section — NFR-8", () => {
    renderHeader({ activeKind: "first_tasks" });
    expect(screen.getByRole("button", { name: "Share link to the First tasks section" })).toBeInTheDocument();
  });

  it("copies the tour's Markdown export — AC-64", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain("# Onboarding for widgets");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
