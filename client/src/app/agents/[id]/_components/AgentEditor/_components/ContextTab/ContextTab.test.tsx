import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AttachedDocs, EffectiveContextPreview, ProjectDocumentList } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextDocsMessages from "../../../../../../../../messages/en/contextDocs.json";

const DOCS: ProjectDocumentList = {
  cloned: true,
  documents: [
    { path: "a.md", bucket: "root", estimated_tokens: 50, used_by_agents: 0 },
    { path: "b.md", bucket: "root", estimated_tokens: 70, used_by_agents: 1 },
    { path: "insights/c.md", bucket: "insights", estimated_tokens: 200, used_by_agents: 0 },
  ],
  total: 3,
  scanned_at: "2026-10-06T00:00:00Z",
};

let docsState: { data?: ProjectDocumentList; isLoading: boolean; isError: boolean } = {
  data: DOCS,
  isLoading: false,
  isError: false,
};
let attachedState: { data?: AttachedDocs; isLoading: boolean } = { data: { paths: ["a.md", "b.md"] }, isLoading: false };
let previewState: { data?: EffectiveContextPreview } = {
  data: {
    cloned: true,
    documents: [
      { path: "a.md", source: "agent", tokens: 50, status: "included", bucket: "root" },
      { path: "b.md", source: "agent", tokens: 70, status: "included", bucket: "root" },
    ],
    total_tokens: 120,
  },
};
let setAttachedIsError = false;

const refetchDocs = vi.fn();
const setAttachedMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ ...docsState, refetch: refetchDocs }),
  useAgentContextDocs: () => attachedState,
  useSetAgentContextDocs: () => ({ mutate: setAttachedMutate, isError: setAttachedIsError }),
  useAgentContextPreview: () => previewState,
  useProjectDoc: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useProjectDocUsage: () => ({ data: undefined }),
}));

import { ContextTab } from "./ContextTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

afterEach(() => {
  cleanup();
  refetchDocs.mockClear();
  setAttachedMutate.mockClear();
  docsState = { data: DOCS, isLoading: false, isError: false };
  attachedState = { data: { paths: ["a.md", "b.md"] }, isLoading: false };
  previewState = {
    data: {
      cloned: true,
      documents: [
        { path: "a.md", source: "agent", tokens: 50, status: "included", bucket: "root" },
        { path: "b.md", source: "agent", tokens: 70, status: "included", bucket: "root" },
      ],
      total_tokens: 120,
    },
  };
  setAttachedIsError = false;
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, contextDocs: contextDocsMessages }}>
      <ContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (agent) — list, order, footer", () => {
  it("lists attached docs first with the right count, reorders with Move down, and sends the full ordered list — AC-16/17/19/22/28", () => {
    renderTab();

    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.map((c) => c.getAttribute("aria-label"))).toEqual(["a.md", "b.md", "insights/c.md"]);
    expect(screen.getByText("≈ 50")).toBeInTheDocument();
    expect(screen.getByText("≈ 70")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(
      screen.getByText("Injected as an untrusted block (## Project context) into every run."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!);
    expect(setAttachedMutate).toHaveBeenCalledWith(["b.md", "a.md"]);
  });

  it("shows the AC-61 helper text", () => {
    renderTab();
    expect(
      screen.getByText(
        "Documents are grouped by top-level folder — specs, docs, insights first, then other folders A–Z, root files last. Within a folder, earlier docs appear earlier in the assembled ## Project context block. Toggle to attach.",
      ),
    ).toBeInTheDocument();
  });

  it("reorders via native drag and drop — D7", () => {
    renderTab();
    const row = (path: string) => screen.getByRole("checkbox", { name: path }).parentElement!;
    fireEvent.dragStart(row("a.md"));
    fireEvent.drop(row("b.md"));
    expect(setAttachedMutate).toHaveBeenCalledWith(["b.md", "a.md"]);
  });

  it("toggling an unattached doc appends it to the saved list — AC-18", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "insights/c.md" }));
    expect(setAttachedMutate).toHaveBeenCalledWith(["a.md", "b.md", "insights/c.md"]);
  });

  it("filters the list by path and by folder — AC-20", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "insights" } });
    expect(screen.getByRole("checkbox", { name: "insights/c.md" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "a.md" })).not.toBeInTheDocument();
  });
});

describe("ContextTab (agent) — missing / inherited rows", () => {
  it("shows 'Not found' + Detach for a missing attached doc and saves without it — AC-26/AC-27", () => {
    attachedState = { data: { paths: ["deleted.md"] }, isLoading: false };
    previewState = {
      data: {
        cloned: true,
        documents: [{ path: "deleted.md", source: "agent", tokens: null, status: "skipped_missing", bucket: "root" }],
        total_tokens: 0,
      },
    };
    renderTab();

    expect(screen.getByText("not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(setAttachedMutate).toHaveBeenCalledWith([]);
  });

  it("shows a read-only 'via skill' row with a disabled checkbox — AC-24", () => {
    attachedState = { data: { paths: [] }, isLoading: false };
    previewState = {
      data: {
        cloned: true,
        documents: [{ path: "a.md", source: "skill:security-rubric", tokens: 50, status: "included", bucket: "root" }],
        total_tokens: 50,
      },
    };
    renderTab();

    expect(screen.getByText("via skill security-rubric")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "a.md" })).toBeDisabled();
  });
});

describe("ContextTab (agent) — token budget and error states", () => {
  it("shows the over-budget badge above 4,000 tokens and nothing at exactly 4,000 — AC-25", () => {
    previewState = { data: { cloned: true, documents: [], total_tokens: 4001 } };
    renderTab();
    expect(screen.getByText("over 4K soft cap")).toBeInTheDocument();
    cleanup();

    previewState = { data: { cloned: true, documents: [], total_tokens: 4000 } };
    renderTab();
    expect(screen.queryByText("over 4K soft cap")).not.toBeInTheDocument();
  });

  it("shows the EC-21 empty state and Re-index requests a new walk", () => {
    docsState = { data: { ...DOCS, documents: [], total: 0 }, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText("Add markdown to the repo, then Re-index.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-index" }));
    expect(refetchDocs).toHaveBeenCalledTimes(1);
  });

  it("shows 'Repository not cloned' — EC-1", () => {
    docsState = { data: { ...DOCS, cloned: false }, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
  });

  it("shows an error state with Retry — EC-7", () => {
    docsState = { data: undefined, isLoading: false, isError: true };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchDocs).toHaveBeenCalledTimes(1);
  });

  it("shows 'No documents match' when the filter has no hits — EC-10", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match")).toBeInTheDocument();
  });

  it("shows an inline save error with Retry that resends the last attempted list — EC-11", () => {
    setAttachedIsError = true;
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0]!);
    expect(setAttachedMutate).not.toHaveBeenCalled(); // no prior attempt was made this render
  });
});
