import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { ToastProvider } from "@/lib/toast";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string }[] }) => (
    <>
      <div data-testid="crumb">{crumb.map((c) => c.label).join(" › ")}</div>
      {children}
    </>
  ),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", name: "payments-api", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

let tourState: OnboardingTourState | undefined;
let tourLoading = false;
const refetch = vi.fn();
const generateMutateSpy = vi.fn();
/** "success" merges NEXT_TOUR into tourState (AC-36); "conflict" rejects 409 (EC-7/EC-8); "fail" rejects 502 (EC-11). */
let generateBehavior: "success" | "conflict" | "fail" = "success";
const resyncMutateSpy = vi.fn();

vi.mock("@/lib/hooks/onboarding-tour", () => ({
  useOnboardingTour: () => ({ data: tourState, isLoading: tourLoading, refetch }),
  useGenerateTour: () => {
    const [state, setState] = React.useState<{ isPending: boolean; isError: boolean; error: unknown }>({
      isPending: false,
      isError: false,
      error: undefined,
    });
    const mutate = () => {
      generateMutateSpy();
      setState({ isPending: true, isError: false, error: undefined });
      Promise.resolve().then(() => {
        if (generateBehavior === "success") {
          tourState = {
            tour: NEXT_TOUR,
            cloned: tourState?.cloned ?? true,
            index_status: tourState?.index_status ?? "full",
            generating: false,
            stale: false,
            current_commit: NEXT_TOUR.tour_commit,
          };
          setState({ isPending: false, isError: false, error: undefined });
        } else if (generateBehavior === "conflict") {
          setState({ isPending: false, isError: true, error: new ApiError("in progress", 409, "generation_in_progress") });
        } else {
          setState({ isPending: false, isError: true, error: new ApiError("provider is down", 502, "external_service_error") });
        }
      });
    };
    return { mutate, ...state };
  },
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutateSpy, isPending: false }),
}));

import { TourView } from "./TourView";

const TOUR: OnboardingTour = {
  repo_id: "repo-1",
  tour_commit: "aaaaaaa1111",
  generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  tracked_file_count: 1201,
  indexed_file_count: 1201,
  model: "deepseek/deepseek-v4-flash",
  api_cost_usd: null,
  duration_ms: 41000,
  architecture: { overview: "Overview text", overview_paths: [], diagram: null },
  critical_paths: [{ path: "src/server.ts", note: "Boot", importer_count: null }],
  how_to_run: [{ command: "pnpm dev", note: null, source: "package.json" }],
  guided_reading: [{ path: "src/server.ts", reason: "Start here", importer_count: null }],
  first_tasks: [{ title: "Add a probe", target: "src/health.ts", complexity: "low", new_file: true }],
  counters: {
    critical_paths: { proposed: 1, dropped: 1 },
    how_to_run: { proposed: 1, dropped: 1 },
    guided_reading: { proposed: 1, dropped: 1 },
    first_tasks: { proposed: 0, dropped: 0 },
  },
};

const NEXT_TOUR: OnboardingTour = {
  ...TOUR,
  tour_commit: "ccccccc3333",
  architecture: { ...TOUR.architecture, overview: "New overview" },
};

function page() {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <TourView repoId="repo-1" />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

function renderPage() {
  return render(page());
}

beforeEach(() => {
  tourState = { tour: null, cloned: true, index_status: "full", generating: false, stale: false, current_commit: null };
  tourLoading = false;
  generateBehavior = "success";
  window.history.replaceState(null, "", "/repos/repo-1/tour");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TourView — crumb, heading and loading", () => {
  it("shows the breadcrumb and heading immediately, and no stored-tour content while loading — AC-2, EC-25", () => {
    tourLoading = true;
    renderPage();
    expect(screen.getByTestId("crumb")).toHaveTextContent("acme/payments-api › Onboarding Tour");
    expect(screen.getByRole("heading", { name: "Onboarding for payments-api" })).toBeInTheDocument();
    expect(screen.queryByText(messages.generate.title)).not.toBeInTheDocument();
  });

  it("shows the load error with Retry when the first request fails, and Retry re-requests it — EC-26", () => {
    tourState = undefined;
    renderPage();
    expect(screen.getByText(messages.loadError.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("TourView — no clone / not index-ready", () => {
  it("shows 'Repository not cloned' with no Generate action — EC-1", () => {
    tourState = { tour: null, cloned: false, index_status: "full", generating: false, stale: false, current_commit: null };
    renderPage();
    expect(screen.getByText(messages.notCloned.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it.each([
    [null, messages.notReady.notIndexed],
    ["failed", messages.notReady.failed],
    ["degraded", messages.notReady.other],
  ] as const)("shows the reason for index status %s and sends one resync on Re-analyze — EC-35", (indexStatus, reasonText) => {
    tourState = { tour: null, cloned: true, index_status: indexStatus, generating: false, stale: false, current_commit: null };
    renderPage();
    expect(screen.getByText(reasonText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }));
    expect(resyncMutateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TourView — empty state and generation", () => {
  it("shows the AC-29 empty state and sends exactly one generate request — AC-29, AC-30", () => {
    renderPage();
    expect(screen.getByText(messages.generate.body)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: messages.generate.cta }));
    expect(generateMutateSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the failure with Retry instead of the empty state on a generation error — EC-11", async () => {
    generateBehavior = "fail";
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.generate.cta }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("provider is down")).toBeInTheDocument();
    expect(screen.queryByText(messages.generate.title)).not.toBeInTheDocument();
  });

  it("keeps the stored tour visible while a generation is pending, then renders the new tour without reload — AC-32, AC-34, AC-36", async () => {
    tourState = { tour: TOUR, cloned: true, index_status: "full", generating: false, stale: false, current_commit: TOUR.tour_commit };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: messages.actions.regenerate }));
    expect(screen.getByRole("button", { name: messages.actions.generating })).toBeDisabled();
    // AC-34: the stored tour's sections stay visible while pending.
    expect(screen.getByText("Overview text")).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("New overview")).toBeInTheDocument();
  });

  it("shows a disabled 'Generating…' instead of the failure Retry when the GET still reports a generation in flight — M-3", async () => {
    generateBehavior = "fail";
    const { rerender } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.generate.cta }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("provider is down")).toBeInTheDocument();

    // Simulate the hook's fix: on any POST error the GET is invalidated/refetched
    // and comes back reporting the server-side run is still going.
    tourState = { ...tourState!, generating: true };
    rerender(page());

    const generatingBtn = screen.getByRole("button", { name: messages.actions.generating });
    expect(generatingBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    // "Generate onboarding tour" is both the title and the enabled CTA's label
    // (same copy) — assert no *enabled* button carries it, not that the text
    // is gone (the title still reads the same).
    expect(screen.queryByRole("button", { name: messages.generate.cta })).not.toBeInTheDocument();

    // The server finished — the next poll flips `generating` back off.
    tourState = { ...tourState, generating: false };
    rerender(page());
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("shows the in-progress notice on a 409 without touching the stored tour — EC-7, EC-8", async () => {
    tourState = { tour: TOUR, cloned: true, index_status: "full", generating: false, stale: false, current_commit: TOUR.tour_commit };
    generateBehavior = "conflict";
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: messages.actions.regenerate }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(messages.inProgress)).toBeInTheDocument();
    expect(screen.getByText("Overview text")).toBeInTheDocument();
  });
});

describe("TourView — stale tour and the footer", () => {
  it("shows the stale banner with both short commits and the generation footer — AC-55, AC-68", () => {
    tourState = { tour: TOUR, cloned: true, index_status: "full", generating: false, stale: true, current_commit: "bbbbbbb2222" };
    renderPage();

    expect(
      screen.getByText(messages.stale.banner.replace("{from}", "aaaaaaa").replace("{to}", "bbbbbbb")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        messages.footer
          .replace("{model}", TOUR.model)
          .replace("{cost}", formatCost(TOUR.api_cost_usd))
          .replace("{seconds}", String(Math.round(TOUR.duration_ms / 1000)))
          .replace("{dropped}", "3"),
      ),
    ).toBeInTheDocument();
  });
});

describe("TourView — URL fragment on load", () => {
  it("expands and scrolls the section named by a known fragment — AC-9", () => {
    window.history.replaceState(null, "", "/repos/repo-1/tour#first_tasks");
    tourState = { tour: TOUR, cloned: true, index_status: "full", generating: false, stale: false, current_commit: TOUR.tour_commit };
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderPage();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "First tasks" })).toHaveAttribute("aria-current", "true");
  });

  it("opens at the top without an error on an unknown fragment — EC-23", () => {
    window.history.replaceState(null, "", "/repos/repo-1/tour#nope");
    tourState = { tour: TOUR, cloned: true, index_status: "full", generating: false, stale: false, current_commit: TOUR.tour_commit };
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderPage();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Architecture overview" })).toHaveAttribute("aria-current", "true");
  });
});
