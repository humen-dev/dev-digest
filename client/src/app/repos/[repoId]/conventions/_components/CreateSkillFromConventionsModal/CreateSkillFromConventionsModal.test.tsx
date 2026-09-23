import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const push = vi.fn();
const createSkill = vi.fn();
let draft: ConventionSkillDraft | undefined;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "Backend Reviewer" }] }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({ data: draft, isLoading: !draft, isError: false, refetch: vi.fn() }),
  useCreateSkillFromConventions: () => ({ mutateAsync: createSkill, isPending: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

const DRAFT: ConventionSkillDraft = {
  name: "payments-api-conventions",
  description: "3 house conventions extracted from payments-api",
  type: "convention",
  enabled: true,
  body: "# payments-api conventions\n\n## API\n- Handlers return DTOs",
  body_tokens: 128,
  evidence_files: ["src/routes.ts"],
  convention_ids: ["c1", "c2", "c3"],
};

const onClose = vi.fn();

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillFromConventionsModal repoId="r1" repoName="payments-api" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  draft = DRAFT;
  createSkill.mockResolvedValue({ id: "sk9" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateSkillFromConventionsModal", () => {
  it("prefills every field from the server draft", () => {
    renderModal();
    expect(screen.getByText(/Merged from/)).toBeInTheDocument();
    expect(screen.getByText("3 accepted conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument();
    expect(screen.queryByLabelText("body")).not.toBeInTheDocument();
  });

  it("waits for the draft before rendering the form", () => {
    draft = undefined;
    renderModal();
    expect(screen.getByText("Assembling the skill from accepted conventions…")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(DRAFT.name)).not.toBeInTheDocument();
  });

  it("disables Create skill while a required field is empty", () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue(DRAFT.name), { target: { value: "  " } });
    expect(screen.getByText("Create skill").closest("button")).toBeDisabled();
  });

  it("creates the skill from the edited draft and opens it", async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue(DRAFT.name), { target: { value: "house-rules" } });
    fireEvent.click(screen.getByText("Create skill"));

    await waitFor(() =>
      expect(createSkill).toHaveBeenCalledWith({
        name: "house-rules",
        description: DRAFT.description,
        type: "convention",
        enabled: true,
        body: DRAFT.body,
        convention_ids: DRAFT.convention_ids,
        agent_id: "ag1",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/sk9?tab=config"));
    expect(onClose).toHaveBeenCalled();
  });

});
