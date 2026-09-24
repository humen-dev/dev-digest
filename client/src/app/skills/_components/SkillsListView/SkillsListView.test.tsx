import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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

const createSkill = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportUrlPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkillTokens: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ToastProvider } from "../../../../lib/toast";
import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
  createSkill.mockClear();
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
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

  it("opens the editor straight away on card click", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("corner-case-checklist"));
    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });

  it("creates from scratch through a modal instead of writing a placeholder skill", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("Add Skill"));

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("Add skill")).toBeInTheDocument();
    expect(within(modal).getByPlaceholderText("pr-quality-rubric")).toBeInTheDocument();
    expect(createSkill).not.toHaveBeenCalled();
  });

  it("offers the From file and Import from URL tabs in the same modal", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("Add Skill"));
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Import from URL" }));
    expect(within(modal).getByPlaceholderText("https://example.com/skills/security.md")).toBeInTheDocument();
  });

  it("filters the grid by the search box", () => {
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "corner" } });
    expect(screen.getByText("corner-case-checklist")).toBeInTheDocument();
    expect(screen.queryByText("uncovered-branch-gate")).not.toBeInTheDocument();
  });
});
