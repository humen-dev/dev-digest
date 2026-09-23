import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branch-gate",
  description: "Flag any new branch without a covering test.",
  type: "rubric",
  source: "manual",
  body: "# Rule\nEvery branch needs a test.",
  enabled: true,
  version: 1,
  evidence_files: null,
  body_tokens: 42,
  agent_count: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders name, type badge, source badge and agent count", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("uncovered-branch-gate")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("shows an Imported badge for imported_file skills", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
  });

  it("calls onToggle without triggering onClick", () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} onClick={onClick} />);
    screen.getByRole("switch").click();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting and never opens the skill", () => {
    const onClick = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);

    screen.getByRole("button", { name: "Delete skill" }).click();

    expect(confirm).toHaveBeenCalledWith('Delete skill "uncovered-branch-gate"? This cannot be undone.');
    expect(onClick).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
