import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage, BriefProvenance } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const PROVENANCE: BriefProvenance = {
  head_sha: "a1b2c3d4e5",
  generated_at: new Date().toISOString(),
  provider: "openai",
  model: "gpt-4.1",
  attempts: 1,
  tokens_in: 1200,
  tokens_out: 340,
  cost_usd: 0.014,
  context_docs: [{ path: "specs/a.md", status: "included", tokens: 900 }],
  dropped_inputs: [],
  missing_sources: [],
};

function stored(over: Partial<BriefPage> = {}, prov: Partial<BriefProvenance> = {}): BriefPage {
  return {
    status: "generated",
    reason: null,
    brief: { summary: "Adds the brief card.", risks: [], review_focus: [] },
    provenance: { ...PROVENANCE, ...prov },
    current_head_sha: "a1b2c3d4e5",
    ...over,
  };
}
const NONE: BriefPage = { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "a1b2c3d4e5" };

const review = (id: string, created_at: string, verdict: string, score: number, nFindings: number) => ({
  id,
  kind: "review",
  verdict,
  score,
  created_at,
  findings: Array.from({ length: nFindings }, (_, i) => ({ severity: i === 0 ? "CRITICAL" : "LOW", dismissed_at: null })),
});

let brief: { data?: BriefPage; isLoading: boolean; isError: boolean };
let gen: { isPending: boolean; isError: boolean; error?: Error; data?: BriefPage; variables?: unknown };
let secrets: Record<string, boolean>;
let reviews: unknown[];
const generateMutate = vi.fn();
const detectMutate = vi.fn();
const refetch = vi.fn();

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ ...brief, refetch }),
  useGenerateBrief: () => ({ ...gen, mutate: generateMutate }),
  useBriefContextCandidates: () => ({
    data: {
      cloned: true,
      candidates: [
        { path: "specs/a.md", estimated_tokens: 1200, preselected: true, reason_code: "pr_referenced", scope: null },
        { path: "client/docs/b.md", estimated_tokens: 400, preselected: false, reason_code: "scope_not_touched", scope: "client" },
      ],
    },
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useSettings: () => ({ data: { feature_models: {} } }),
  useSecretsStatus: () => ({ data: secrets }),
}));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => ({ data: reviews }) }));
vi.mock("@/lib/hooks/intent", () => ({ useDetectIntent: () => ({ mutate: detectMutate, isPending: false }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ data: { cloned: true, documents: [{ path: "docs/extra.md", estimated_tokens: 300 }] } }),
}));

import { PrBriefSection } from "./PrBriefSection";

beforeEach(() => {
  brief = { data: stored(), isLoading: false, isError: false };
  gen = { isPending: false, isError: false };
  secrets = { openai: true, anthropic: true, openrouter: true, github: true };
  reviews = [];
});
afterEach(() => {
  cleanup();
  generateMutate.mockClear();
  detectMutate.mockClear();
  refetch.mockClear();
});

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PrBriefSection prId="pr1" repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefSection", () => {
  it("empty page: Generate posts once; the picker lists candidates and search adds a doc — AC-42, AC-43, AC-65, AC-66", () => {
    brief = { data: NONE, isLoading: false, isError: false };
    renderSection();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("Generate a Why+Risk brief for this PR.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Context" }));
    expect(screen.getByRole("checkbox", { name: /specs\/a\.md/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /client\/docs\/b\.md/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("client — not touched by this PR")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search project documents"), { target: { value: "extra" } });
    fireEvent.click(screen.getByRole("button", { name: "docs/extra.md" }));
    expect(screen.getByRole("checkbox", { name: /docs\/extra\.md/ })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    expect(generateMutate).toHaveBeenCalledWith({ context_paths: ["specs/a.md", "docs/extra.md"] });
  });

  it("without a picker choice the Generate body carries no context_paths", () => {
    brief = { data: NONE, isLoading: false, isError: false };
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).toHaveBeenCalledWith({});
  });

  it("shows a skeleton while the first generation is pending, and when the server says generating — AC-44", () => {
    brief = { data: NONE, isLoading: false, isError: false };
    gen = { isPending: true, isError: false };
    renderSection();
    expect(screen.getByRole("status", { name: "PR Brief" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No brief yet")).not.toBeInTheDocument();
    cleanup();

    gen = { isPending: false, isError: false };
    brief = { data: { ...NONE, status: "generating" }, isLoading: false, isError: false };
    renderSection();
    expect(screen.getByRole("status", { name: "PR Brief" })).toBeInTheDocument();
  });

  it("stored brief: summary as text, verdict from the newest review, tokens, cost, model, hint — AC-45..AC-50, UT-10, AC-71", () => {
    brief = {
      data: stored({ brief: { summary: "<img src=x onerror=alert(1)>", risks: [], review_focus: [] } }),
      isLoading: false,
      isError: false,
    };
    reviews = [
      review("old", "2026-10-01T00:00:00Z", "approve", 90, 1),
      review("new", "2026-10-05T00:00:00Z", "request_changes", 42, 3),
    ];
    const { container } = renderSection();

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("Score 42")).toBeInTheDocument();
    expect(screen.getByText(/1[, ]?200 → 340 tok/)).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText(/Generated .* · gpt-4\.1/)).toBeInTheDocument();
    expect(generateMutate).not.toHaveBeenCalled();

    const hint = screen.getByRole("button", { name: /Verdict, findings and score/ });
    fireEvent.focus(hint);
    expect(screen.getByRole("tooltip")).toHaveTextContent("what / why / risks / review-focus come from the brief");
  });

  it("no review and null cost: no verdict block, cost shows an em dash — AC-47, AC-49", () => {
    brief = { data: stored({}, { cost_usd: null }), isLoading: false, isError: false };
    renderSection();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("names missing data and budget drops, and Detect intent posts intent — AC-62, AC-63, AC-64", () => {
    brief = {
      data: stored(
        {},
        {
          missing_sources: ["intent_not_detected", "blast_degraded:no_data"],
          dropped_inputs: [{ kind: "context_doc", id: "docs/big.md" }],
        },
      ),
      isLoading: false,
      isError: false,
    };
    renderSection();
    expect(screen.getByText("Intent not detected")).toBeInTheDocument();
    expect(screen.getByText("Blast radius degraded (no_data)")).toBeInTheDocument();
    expect(screen.getByText("Context document dropped by budget: docs/big.md")).toBeInTheDocument();
    expect(screen.getByText("Context documents used")).toBeInTheDocument();
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("Dropped by budget")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Detect intent" }));
    expect(detectMutate).toHaveBeenCalledTimes(1);
  });

  it("regenerate replays the recorded docs; while pending the old summary stays and the control is busy — AC-67, AC-68", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Re-run the brief for this PR" }));
    expect(generateMutate).toHaveBeenCalledWith({ regenerate: true, context_paths: ["specs/a.md"] });
    cleanup();

    gen = { isPending: true, isError: false };
    renderSection();
    expect(screen.getByText("Adds the brief card.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run the brief for this PR" })).toBeDisabled();
  });

  it("outdated brief shows both SHAs — AC-70", () => {
    brief = { data: stored({ status: "outdated", current_head_sha: "f00ba12ffff" }, { head_sha: "a1b2c3d9999" }), isLoading: false, isError: false };
    renderSection();
    expect(screen.getByText("Outdated (a1b2c3d → f00ba12)")).toBeInTheDocument();
  });

  it("disables Generate and links to Settings when the provider key is missing — AC-72, AC-84", () => {
    brief = { data: NONE, isLoading: false, isError: false };
    secrets = { openai: false, anthropic: true, openrouter: true, github: true };
    renderSection();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.getByText(/No API key for openai/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings → Models" })).toHaveAttribute("href", "/settings/models");
  });

  it("refused / failed / HTTP error render a notice above the brief with Retry — EC-2, EC-5", () => {
    gen = { isPending: false, isError: false, data: { ...NONE, status: "refused", reason: "over_budget" } };
    renderSection();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not fit the brief input budget/);
    expect(screen.getByText("Adds the brief card.")).toBeInTheDocument();
    cleanup();

    gen = { isPending: false, isError: false, data: { ...NONE, status: "failed", reason: "timeout" }, variables: { regenerate: true } };
    renderSection();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't generate the brief. The model did not answer in time.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(generateMutate).toHaveBeenCalledWith({ regenerate: true });
    cleanup();

    gen = { isPending: false, isError: true, error: new Error("Server exploded") };
    renderSection();
    expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("error + Retry only without data; a failed refetch with data keeps the brief — EC-17, EC-18", () => {
    brief = { data: undefined, isLoading: false, isError: true };
    renderSection();
    expect(screen.getByText("Couldn't load the brief.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    cleanup();

    brief = { data: stored(), isLoading: false, isError: true };
    renderSection();
    expect(screen.getByText("Adds the brief card.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the brief.")).not.toBeInTheDocument();
  });
});
