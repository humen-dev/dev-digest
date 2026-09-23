import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const VERSIONS: SkillVersion[] = [
  // v1 predates the message field, so it exercises the "no message" fallback.
  { skill_id: "sk1", version: 1, body: "old body", created_at: "2026-09-01T00:00:00.000Z" },
  {
    skill_id: "sk1",
    version: 2,
    body: "new body",
    message: "Tightened scope rule",
    created_at: "2026-09-20T00:00:00.000Z",
  },
];

const restoreMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
  useSkillVersionDiff: () => ({ data: undefined, isLoading: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branch-gate",
  description: "Flag any new branch without a covering test.",
  type: "rubric",
  source: "manual",
  body: "new body",
  enabled: true,
  version: 2,
  evidence_files: null,
  body_tokens: 10,
  agent_count: 1,
};

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  restoreMutate.mockClear();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("VersionsTab (smoke)", () => {
  it("marks the newest version as Current", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
  });

  it("calls the restore mutation for a non-current version", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    // Only v1 (non-current) has a Restore button.
    expect(restoreButtons).toHaveLength(1);
    fireEvent.click(restoreButtons[0]!);
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 1 });
  });

  it("leads each row with the version message, falling back when there is none", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Tightened scope rule")).toBeInTheDocument();
    expect(screen.getByText("No version message")).toBeInTheDocument();
  });

  it("offers no Diff on the current version (its patch vs. current is always empty)", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(1);
  });
});
