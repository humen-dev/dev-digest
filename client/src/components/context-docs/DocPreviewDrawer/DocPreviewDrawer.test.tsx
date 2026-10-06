import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocumentContent, ProjectDocumentUsage } from "@devdigest/shared";
import contextDocsMessages from "../../../../messages/en/contextDocs.json";

const DOC: ProjectDocumentContent = {
  path: "a.md",
  bucket: "root",
  estimated_tokens: 317,
  text: "# Heading\n\n<script>alert(1)</script>\n\nSome **bold** text.",
};
const USAGE: ProjectDocumentUsage = {
  path: "a.md",
  agents: [{ id: "1", name: "Agent A" }, { id: "2", name: "Agent B" }],
  skills: [],
};

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDoc: () => ({ data: DOC, isLoading: false, isError: false, refetch: vi.fn() }),
  useProjectDocUsage: () => ({ data: USAGE }),
}));

import { DocPreviewDrawer } from "./DocPreviewDrawer";

afterEach(cleanup);

function renderDrawer(attached: boolean, onToggleAttach = vi.fn()) {
  return {
    onToggleAttach,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ contextDocs: contextDocsMessages }}>
        <DocPreviewDrawer
          repoId="repo1"
          path="a.md"
          bucket="root"
          attached={attached}
          onToggleAttach={onToggleAttach}
          onClose={() => {}}
        />
      </NextIntlClientProvider>,
    ),
  };
}

describe("DocPreviewDrawer", () => {
  it("shows the title, bucket, usage, tokens and rendered body, with hostile Markdown inert — AC-21/AC-23/UT-4", () => {
    renderDrawer(false);
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.getByText("≈ 317 tokens")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("Attach toggles the saved list and the label becomes Attached — AC-62", () => {
    const { onToggleAttach } = renderDrawer(false);
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onToggleAttach).toHaveBeenCalledWith(true);
    cleanup();

    renderDrawer(true);
    expect(screen.getByRole("button", { name: "Attached" })).toBeInTheDocument();
  });
});
