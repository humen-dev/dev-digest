import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const NOW = new Date().toISOString();

const BRIEF_PAGE: BriefPage = {
  status: "generated",
  reason: null,
  brief: {
    summary: "Adds the brief card.",
    risks: [
      {
        kind: "security",
        title: "Config parsing is loose",
        explanation: "Unvalidated input.",
        severity: "high",
        file_refs: ["src/config.ts:12"],
      },
    ],
    review_focus: [
      { file: "src/config.ts", line: 12, reason: "new parser" },
      { file: "src/other.ts", line: null, reason: "wiring" },
    ],
  },
  provenance: null,
  current_head_sha: "a1b2c3d4e5",
};
const NO_BRIEF: BriefPage = { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "a1b2c3d4e5" };

const INTENT = {
  intent: {
    intent: "Ship the brief card",
    confidence: "high",
    in_scope: [],
    out_of_scope: [],
    sources: [],
    missing_context: [],
    head_sha: "a1b2c3d4e5",
    model: "gpt-4.1",
    updated_at: NOW,
  },
  stale: false,
  current_head_sha: "a1b2c3d4e5",
};

let brief: { data?: BriefPage; isLoading: boolean; isError: boolean };
let intent: { data?: unknown; isLoading: boolean; isError: boolean };
const generateMutate = vi.fn();
const detectMutate = vi.fn();

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ ...brief, refetch: vi.fn() }),
  useGenerateBrief: () => ({ isPending: false, isError: false, mutate: generateMutate }),
  useBriefContextCandidates: () => ({ data: { cloned: true, candidates: [] }, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ ...intent, refetch: vi.fn() }),
  useDetectIntent: () => ({ mutate: detectMutate, isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useSettings: () => ({ data: { feature_models: {} } }),
  useSecretsStatus: () => ({ data: { openai: true, anthropic: true, openrouter: true, github: true } }),
}));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ data: { cloned: true, documents: [] } }),
}));
// BlastRadius pulls graph/history hooks of its own; only its position matters here.
vi.mock("../BlastRadius", () => ({ BlastRadius: () => <div data-testid="blast-radius">Blast radius</div> }));

import { OverviewTab } from "./OverviewTab";

const onOpenDiffTarget = vi.fn();

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <OverviewTab
        prId="pr1"
        prBody="PR description text"
        repoId="r"
        repoFullName="o/r"
        headSha="a1b2c3d4e5"
        changedPaths={["src/config.ts", "src/other.ts"]}
        onOpenDiffTarget={onOpenDiffTarget}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  brief = { data: BRIEF_PAGE, isLoading: false, isError: false };
  intent = { data: INTENT, isLoading: false, isError: false };
});
afterEach(() => {
  cleanup();
  generateMutate.mockClear();
  detectMutate.mockClear();
  onOpenDiffTarget.mockClear();
});

describe("OverviewTab", () => {
  it("brief + intent: Risk areas live inside the Intent card, Blast radius beside it, Review focus below — AC-51, AC-53, AC-58, AC-71", () => {
    renderTab();
    const risks = screen.getByRole("heading", { name: "Risk areas" });
    const intentSection = screen.getByText(/Ship the brief card/).closest("section")!;
    expect(intentSection).toContainElement(risks);

    const blast = screen.getByTestId("blast-radius");
    expect(intentSection).not.toContainElement(blast);
    expect(intentSection.parentElement).toBe(blast.closest("section")!.parentElement);
    expect(intentSection.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const focus = screen.getByRole("heading", { name: /Review focus/ });
    expect(blast.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intentSection.parentElement).not.toContainElement(focus);
    expect(screen.getByText("PR description text")).toBeInTheDocument();

    // Opening Overview with a stored brief never generates (no POST).
    expect(generateMutate).not.toHaveBeenCalled();
    expect(detectMutate).not.toHaveBeenCalled();
  });

  it("brief, no intent: Risk areas card takes the Intent slot — AC-52", () => {
    intent = { data: { intent: null, stale: false, current_head_sha: "a1b2c3d4e5" }, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.queryByText("No intent detected yet")).not.toBeInTheDocument();
    const blast = screen.getByTestId("blast-radius");
    const risks = screen.getByRole("heading", { name: "Risk areas" });
    expect(risks.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("brief, intent query failed: IntentCard shows its error and Risk areas still render", () => {
    intent = { data: undefined, isLoading: false, isError: true };
    renderTab();
    const risks = screen.getByRole("heading", { name: "Risk areas" });
    expect(screen.getByText("Config parsing is loose")).toBeInTheDocument();
    const error = screen.getByText(/Couldn't load intent/);
    expect(error.compareDocumentPosition(risks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(risks.compareDocumentPosition(screen.getByTestId("blast-radius")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("brief, intent loading: Risk areas render below the IntentCard skeleton", () => {
    intent = { data: undefined, isLoading: true, isError: false };
    renderTab();
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
  });

  it("focus item click and risk ref click call onOpenDiffTarget — AC-74", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /src\/config\.ts:12.*new parser/ }));
    expect(onOpenDiffTarget).toHaveBeenCalledWith({ file: "src/config.ts", line: 12 });

    fireEvent.click(screen.getByRole("button", { name: /src\/other\.ts.*wiring/ }));
    expect(onOpenDiffTarget).toHaveBeenLastCalledWith({ file: "src/other.ts", line: null });
  });

  it("no brief: today's layout — Intent, Blast radius, Description; no Review focus", () => {
    brief = { data: NO_BRIEF, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByText(/Ship the brief card/)).toBeInTheDocument();
    expect(screen.getByTestId("blast-radius")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Review focus/ })).not.toBeInTheDocument();
  });
});
