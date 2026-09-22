import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
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
});
