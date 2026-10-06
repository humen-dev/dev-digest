import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AttachedDocs, ProjectDocumentList, Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import contextDocsMessages from "../../../../../../../../messages/en/contextDocs.json";

const DOCS: ProjectDocumentList = {
  cloned: true,
  documents: [
    { path: "README.md", bucket: "root", estimated_tokens: 20, used_by_agents: 0 },
    { path: "insights/a.md", bucket: "insights", estimated_tokens: 30, used_by_agents: 0 },
    { path: "server/b.md", bucket: "server", estimated_tokens: 40, used_by_agents: 0 },
    { path: "specs/c.md", bucket: "specs", estimated_tokens: 50, used_by_agents: 0 },
  ],
  total: 4,
  scanned_at: "2026-10-06T00:00:00Z",
};

let docsState: { data?: ProjectDocumentList; isLoading: boolean; isError: boolean } = {
  data: DOCS,
  isLoading: false,
  isError: false,
};
let attachedState: { data?: AttachedDocs; isLoading: boolean } = {
  data: { paths: ["README.md", "insights/a.md", "server/b.md", "specs/c.md"] },
  isLoading: false,
};
let setAttachedIsError = false;

const refetchDocs = vi.fn();
const setAttachedMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ ...docsState, refetch: refetchDocs }),
  useSkillContextDocs: () => attachedState,
  useSetSkillContextDocs: () => ({ mutate: setAttachedMutate, isError: setAttachedIsError }),
  useProjectDoc: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useProjectDocUsage: () => ({ data: undefined }),
}));

import { ContextTab } from "./ContextTab";

function makeSkill(): Skill {
  return {
    id: "sk1",
    name: "security-rubric",
    description: "",
    type: "security",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    body_tokens: 5,
    agent_count: 1,
  };
}

afterEach(() => {
  cleanup();
  refetchDocs.mockClear();
  setAttachedMutate.mockClear();
  docsState = { data: DOCS, isLoading: false, isError: false };
  attachedState = { data: { paths: ["README.md", "insights/a.md", "server/b.md", "specs/c.md"] }, isLoading: false };
  setAttachedIsError = false;
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, contextDocs: contextDocsMessages }}>
      <ContextTab skill={makeSkill()} />
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (skill) — order, grouping, badge", () => {
  it("groups the Serializes-as preview as specs, insights, server, root — AC-37", () => {
    renderTab();
    const headings = screen.getAllByText(/^Project /).map((el) => el.textContent);
    expect(headings).toEqual(["Project specifications", "Project insights", "Project server", "Project root"]);
  });

  it("shows the attached count badge — AC-63", () => {
    renderTab();
    expect(screen.getByText("4 attached")).toBeInTheDocument();
  });

  it("toggle sends a PUT for the skill's own list — AC-35", () => {
    attachedState = { data: { paths: [] }, isLoading: false };
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "README.md" }));
    expect(setAttachedMutate).toHaveBeenCalledWith(["README.md"]);
  });

  it("ArrowDown on a focused row saves the new order without a pointer — AC-35/NFR-6", () => {
    renderTab();
    const row = screen.getByRole("checkbox", { name: "README.md" }).parentElement!;
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(setAttachedMutate).toHaveBeenCalledWith(["insights/a.md", "README.md", "server/b.md", "specs/c.md"]);
  });

  it("shows the inherit note — AC-36", () => {
    renderTab();
    expect(
      screen.getByText("Any agent using this skill inherits these documents."),
    ).toBeInTheDocument();
  });
});

describe("ContextTab (skill) — empty / error states", () => {
  it("shows the EC-22 no-row state with a '+ Attach documents' button that clears the filter", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText("No project context attached to this skill.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Attach documents" }));
    expect(screen.getByLabelText("Filter documents…")).toHaveValue("");
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
});
