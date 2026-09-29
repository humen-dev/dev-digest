import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistoryResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../../../messages/en/blast.json";

const ITEMS: PrHistoryResponse["history"] = [
  { pr_number: 12, title: "Fix cost rounding", merged_at: "2026-03-14T10:00:00Z", author: "alice", files_overlap: ["a.ts", "b.ts"], notes: "" },
  { pr_number: 9, title: "Add totals", merged_at: "2026-02-01T10:00:00Z", author: "bob", files_overlap: ["a.ts"], notes: "" },
  { pr_number: 4, title: "Init", merged_at: "2026-01-01T10:00:00Z", author: "carol", files_overlap: ["c.ts"], notes: "" },
];

let state: { data?: PrHistoryResponse; isLoading: boolean } = { isLoading: false };
const refetch = vi.fn();

vi.mock("@/lib/hooks/pr-history", () => ({
  usePrHistory: () => ({ ...state, refetch }),
}));

import { PriorPrs } from "./PriorPrs";

afterEach(() => {
  cleanup();
  refetch.mockClear();
  state = { isLoading: false };
});

function renderBlock() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <PriorPrs prId="pr1" repoFullName="acme/widgets" />
    </NextIntlClientProvider>,
  );
}

const base = { files_considered: 3, files_total: 3 };

describe("PriorPrs", () => {
  it("shows a count badge, hides the list until expanded, then lists linked PRs", () => {
    state = { isLoading: false, data: { history: ITEMS, available: true, reason: null, ...base } };
    renderBlock();

    const toggle = screen.getByRole("button", { name: /Prior PRs touching these files/ });
    expect(toggle).toHaveTextContent("3");
    expect(screen.queryByText(/Fix cost rounding/)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const link = screen.getByRole("link", { name: /Open PR #12/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/pull/12");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("#12 Fix cost rounding");
    expect(screen.getByText(/merged 2026-03-14 by @alice/)).toBeInTheDocument();
    expect(screen.getByText("2 shared files")).toBeInTheDocument();
  });

  it("shows a dash badge and the token hint when history is unavailable", () => {
    state = { isLoading: false, data: { history: [], available: false, reason: "no_token", files_considered: 0, files_total: 0 } };
    renderBlock();

    const toggle = screen.getByRole("button", { name: /Prior PRs touching these files/ });
    expect(toggle).toHaveTextContent("—");
    fireEvent.click(toggle);
    expect(screen.getByText(/GITHUB_TOKEN/)).toBeInTheDocument();
  });

  it("shows loading, then an error with a retry that refetches", () => {
    state = { isLoading: true };
    const { rerender } = renderBlock();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("Loading prior PRs…")).toBeInTheDocument();

    state = { isLoading: false };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <PriorPrs prId="pr1" repoFullName="acme/widgets" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Couldn't load prior PRs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
