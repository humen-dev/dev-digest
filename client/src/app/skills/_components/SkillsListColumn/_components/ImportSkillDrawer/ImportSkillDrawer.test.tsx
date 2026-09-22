import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const PREVIEW: SkillImportPreview = {
  draft: {
    name: "flaky-test-patterns",
    description: "Flags real timers, sleep, order-dependent tests.",
    type: "custom",
    body: "# Flaky test patterns\nDo not use real timers.",
  },
  ignored_entries: ["scripts/install.sh", "scripts/check.py"],
  warnings: ["Executable parts are not processed."],
};

const previewMutateAsync = vi.fn().mockResolvedValue(PREVIEW);
const createMutateAsync = vi.fn().mockResolvedValue({ id: "sk-new", name: "flaky-test-patterns" });

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(() => {
  cleanup();
  previewMutateAsync.mockClear();
  createMutateAsync.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

function selectFile() {
  const file = new File(["# Flaky test patterns"], "flaky-test-patterns.zip", { type: "application/zip" });
  const input = screen.getByLabelText("Choose a .md or .zip file…", { selector: "input" }) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillDrawer (smoke)", () => {
  it("shows ignored_entries in the preview before the skill is saved", async () => {
    renderWithIntl(<ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />);

    selectFile();

    await waitFor(() => expect(previewMutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("scripts/install.sh")).toBeInTheDocument();
    expect(screen.getByText("scripts/check.py")).toBeInTheDocument();

    // Nothing is saved until the user confirms.
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("confirms by creating the skill with source imported_file", async () => {
    const onImported = vi.fn();
    renderWithIntl(<ImportSkillDrawer onClose={vi.fn()} onImported={onImported} />);

    selectFile();
    await screen.findByText("scripts/install.sh");

    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ source: "imported_file", body: PREVIEW.draft.body }),
    );
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("sk-new"));
  });
});
