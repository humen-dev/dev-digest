import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

function makeSkill(id: string, name: string): Skill {
  return {
    id,
    name,
    description: "",
    type: "custom",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    body_tokens: 5,
    agent_count: 1,
  };
}

const SKILLS: Skill[] = [makeSkill("sk-a", "skill-a"), makeSkill("sk-b", "skill-b"), makeSkill("sk-c", "skill-c")];
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk-a", order: 0 },
  { agent_id: "ag1", skill_id: "sk-b", order: 1 },
];

const setSkillsMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
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
  setSkillsMutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillsTab (smoke)", () => {
  it("moving the first linked skill down sends the reordered skill_ids", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const moveDown = screen.getAllByRole("button", { name: "Move down" });
    fireEvent.click(moveDown[0]!); // skill-a (index 0) moves past skill-b
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk-b", "sk-a"] });
  });

  it("checking an unlinked skill set-replaces with it appended", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const unlinkedCheckbox = screen.getByRole("checkbox", { name: "skill-c" });
    fireEvent.click(unlinkedCheckbox);
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk-a", "sk-b", "sk-c"] });
  });

  it("unchecking a linked skill removes it from the set", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const linkedCheckbox = screen.getByRole("checkbox", { name: "skill-a" });
    fireEvent.click(linkedCheckbox);
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk-b"] });
  });
});
