import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

// AppShell pulls in the command palette, shortcuts and repo context — none of
// which this view owns. Render its children only.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "uncovered-branch-gate",
    description: "Flag any new branch without a covering test.",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
    evidence_files: null,
    body_tokens: 42,
    agent_count: 3,
  },
  {
    id: "sk2",
    name: "corner-case-checklist",
    description: "Check for missing edge-case tests.",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: false,
    version: 2,
    evidence_files: null,
    body_tokens: 17,
    agent_count: 1,
  },
];

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("lists every skill instead of redirecting to the first one", () => {
    renderWithIntl();
    expect(screen.getByText("uncovered-branch-gate")).toBeInTheDocument();
    expect(screen.getByText("corner-case-checklist")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("opens a skill's Config tab on card click", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("corner-case-checklist"));
    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });

  it("filters the grid by the search box", () => {
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "corner" } });
    expect(screen.getByText("corner-case-checklist")).toBeInTheDocument();
    expect(screen.queryByText("uncovered-branch-gate")).not.toBeInTheDocument();
  });
});
