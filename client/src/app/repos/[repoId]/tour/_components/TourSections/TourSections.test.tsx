import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import type { OnboardingTour, TourSectionKind } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import { TourSections } from "./TourSections";
import { TOUR_SECTION_ORDER } from "./constants";

afterEach(cleanup);

const TOUR: OnboardingTour = {
  repo_id: "repo-1",
  tour_commit: "sha1",
  generated_at: new Date().toISOString(),
  tracked_file_count: 120,
  indexed_file_count: 120,
  model: "gpt-5",
  api_cost_usd: 0.01,
  duration_ms: 4200,
  architecture: {
    overview: "The **gateway** calls `src/server.ts` to boot.",
    overview_paths: ["src/server.ts"],
    diagram: null,
  },
  critical_paths: [{ path: "src/server.ts", note: "App bootstrap", importer_count: 1 }],
  how_to_run: [{ command: "pnpm dev", note: null, source: "package.json" }],
  guided_reading: [{ path: "src/server.ts", reason: "Start here", importer_count: null }],
  first_tasks: [{ title: "Add a probe", target: "src/health.ts", complexity: "low", new_file: true }],
  counters: {
    critical_paths: { proposed: 1, dropped: 0 },
    how_to_run: { proposed: 1, dropped: 0 },
    guided_reading: { proposed: 1, dropped: 0 },
    first_tasks: { proposed: 1, dropped: 0 },
  },
};

const SECTION_TITLES: Record<TourSectionKind, string> = {
  architecture_overview: "Architecture overview",
  critical_paths: "Critical paths",
  how_to_run: "How to run locally",
  guided_reading: "Guided reading path",
  first_tasks: "First tasks",
};

function ControlledTourSections() {
  const [expanded, setExpanded] = useState<Record<TourSectionKind, boolean>>({
    architecture_overview: true,
    critical_paths: true,
    how_to_run: true,
    guided_reading: true,
    first_tasks: true,
  });
  return (
    <TourSections
      tour={TOUR}
      repoFullName="acme/widgets"
      cloned
      expanded={expanded}
      onToggle={(kind) => setExpanded((prev) => ({ ...prev, [kind]: !prev[kind] }))}
      registerSection={() => {}}
    />
  );
}

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <ControlledTourSections />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("TourSections", () => {
  it("renders the 5 cards in section order, all expanded — SPEC-03 AC-3, NFR-8", () => {
    renderWithIntl();
    const headers = screen.getAllByRole("button", { name: /.+/ }).filter((btn) => btn.hasAttribute("aria-expanded"));
    expect(headers.map((h) => h.textContent)).toEqual(TOUR_SECTION_ORDER.map((kind) => SECTION_TITLES[kind]));
    headers.forEach((h) => expect(h).toHaveAttribute("aria-expanded", "true"));
  });

  it("hides and then shows a section's content when its header is clicked — AC-5", () => {
    renderWithIntl();
    const header = screen.getByRole("button", { name: "Critical paths" });
    expect(screen.getByText("App bootstrap", { exact: false })).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("App bootstrap", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("App bootstrap", { exact: false })).toBeInTheDocument();
  });
});
