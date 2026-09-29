import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";

const HEALTHY: BlastRadiusResponse = {
  changed_symbols: [{ name: "formatCost", file: "src/lib/cost.ts", kind: "function" }],
  downstream: [
    {
      symbol: "formatCost",
      callers: [
        { name: "renderRow", file: "src/ui/row.ts", line: 23 },
        { name: "renderTotal", file: "src/ui/total.ts", line: 8 },
      ],
      endpoints_affected: ["GET /api/costs"],
      crons_affected: ["nightly-report"],
    },
  ],
  summary: "1 symbol · 2 callers · 1 endpoint · 1 cron job",
  stats: { symbols: 1, callers: 2, endpoints: 1, crons: 1 },
  unattributed_endpoints: [],
  degraded: false,
  reason: null,
};

let state: { data?: BlastRadiusResponse; isLoading: boolean; isError: boolean; error?: unknown } = {
  data: HEALTHY,
  isLoading: false,
  isError: false,
};
const refetch = vi.fn();
const resyncMutate = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ ...state, refetch }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false, isSuccess: false }),
}));

import { BlastRadius } from "./BlastRadius";

afterEach(() => {
  cleanup();
  refetch.mockClear();
  resyncMutate.mockClear();
  state = { data: HEALTHY, isLoading: false, isError: false };
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <BlastRadius prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadius", () => {
  it("shows stats, caller deep links and separate endpoint/cron chips, and collapses a symbol", () => {
    renderCard();

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("cron/jobs")).toBeInTheDocument();
    expect(screen.getByText("2 callers")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /renderRow/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/blob/abc123/src/ui/row.ts#L23");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("↳ src/ui/row.ts:23");

    expect(screen.getByRole("list", { name: "Affected endpoints" })).toHaveTextContent("GET /api/costs");
    expect(screen.getByRole("list", { name: "Affected cron jobs" })).toHaveTextContent("nightly-report");

    fireEvent.click(screen.getByRole("button", { name: /formatCost/ }));
    expect(screen.queryByRole("link", { name: /renderRow/ })).not.toBeInTheDocument();
  });

  it("shows the no-callers text without rows", () => {
    state = {
      data: { ...HEALTHY, downstream: [], stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } },
      isLoading: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /formatCost/ })).not.toBeInTheDocument();
  });

  it("shows a degraded badge with Resync, hidden for flag_off", () => {
    state = { data: { ...HEALTHY, degraded: true, reason: "no_data" }, isLoading: false, isError: false };
    const { unmount } = renderCard();

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText("This repo has not been indexed yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(resyncMutate).toHaveBeenCalledTimes(1);
    unmount();

    state = { data: { ...HEALTHY, degraded: true, reason: "flag_off" }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByText(/REPO_INTEL_ENABLED=false/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    state = { isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("Couldn't load the blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
