import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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
  it("renders name, type badge, source badge, agent count and version", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, version: 4 }} />);
    expect(screen.getByText("uncovered-branch-gate")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
  });

  it("shows an Imported badge for imported_file skills", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
  });

  it("marks an injected skill as blocked and removes its enable toggle", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, enabled: false, injection_detected: true }} onToggle={vi.fn()} />);
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
    expect(screen.getByText("blocked — injection detected")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("calls onToggle without triggering onClick", () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} onClick={onClick} />);
    screen.getByRole("switch").click();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens a confirmation dialog before deleting and never opens the skill", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent('Delete skill "uncovered-branch-gate"?');
    expect(within(dialog).getByText("Delete")).toBeInTheDocument();
    expect(within(dialog).getByText("Cancel")).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes the confirmation dialog on cancel without deleting", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Cancel"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
