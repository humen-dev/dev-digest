import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocumentContent, ProjectDocumentList, ProjectDocumentUsage } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/projectContext.json";

const refetch = vi.fn();
const useProjectDocsMock = vi.fn();
const saveMutateSpy = vi.fn();

let docsState: {
  data: ProjectDocumentList | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};
let contentByPath: Record<string, ProjectDocumentContent>;
let usageByPath: Record<string, ProjectDocumentUsage>;
/** Drives the mocked save mutation's outcome — flip per test before clicking Save. */
let saveBehavior: "success" | "error";
let saveErrorMessage: string;

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "payments-api", full_name: "humen-dev/payments-api" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: (repoId: string) => {
    useProjectDocsMock(repoId);
    return { ...docsState, refetch };
  },
  useProjectDoc: (_repoId: string, path: string | null) => {
    const data = path ? contentByPath[path] : undefined;
    return { data, isLoading: false, isError: path != null && !data };
  },
  useProjectDocUsage: (_repoId: string, path: string | null) => ({
    data: path ? usageByPath[path] : undefined,
    isLoading: false,
  }),
  // A tiny real mutation stand-in: `mutate` applies the configured outcome via
  // real `useState`, so the component re-renders the same way it would with
  // the real TanStack mutation.
  useSaveProjectDoc: () => {
    const [state, setState] = React.useState<{ isPending: boolean; isError: boolean; error: unknown }>({
      isPending: false,
      isError: false,
      error: undefined,
    });
    const mutate = (
      vars: { path: string; text: string },
      opts?: { onSuccess?: (data: ProjectDocumentContent) => void },
    ) => {
      saveMutateSpy(vars, opts);
      if (saveBehavior === "success") {
        const saved: ProjectDocumentContent = { ...contentByPath[vars.path]!, text: vars.text };
        contentByPath[vars.path] = saved;
        setState({ isPending: false, isError: false, error: undefined });
        opts?.onSuccess?.(saved);
      } else {
        setState({ isPending: false, isError: true, error: new ApiError(saveErrorMessage, 500) });
      }
    };
    return { mutate, ...state };
  },
}));

import { ProjectContextView } from "./ProjectContextView";

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

const DOC_A: ProjectDocumentContent = { path: "docs/a.md", bucket: "docs", estimated_tokens: 20, text: "# A\n\nBody A." };
const DOC_B: ProjectDocumentContent = { path: "docs/b.md", bucket: "docs", estimated_tokens: 30, text: "# B\n\nBody B." };

beforeEach(() => {
  docsState = {
    data: {
      cloned: true,
      documents: [
        { path: "docs/a.md", bucket: "docs", estimated_tokens: 20, used_by_agents: 0 },
        { path: "docs/b.md", bucket: "docs", estimated_tokens: 30, used_by_agents: 1 },
      ],
      total: 2,
      scanned_at: new Date().toISOString(),
    },
    isLoading: false,
    isError: false,
    error: undefined,
  };
  contentByPath = { "docs/a.md": { ...DOC_A }, "docs/b.md": { ...DOC_B } };
  usageByPath = {};
  saveBehavior = "success";
  saveErrorMessage = "500 Internal Server Error";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectContextView", () => {
  it("fetches the document list exactly once per mount — AC-12", () => {
    renderView();
    expect(useProjectDocsMock).toHaveBeenCalledTimes(1);
  });

  it("shows a loading skeleton while the walk is pending — EC-8", () => {
    docsState = { ...docsState, data: undefined, isLoading: true };
    renderView();
    expect(screen.queryByText("docs/a.md")).not.toBeInTheDocument();
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  });

  it("shows an error with Retry when the walk fails, and Retry re-requests it — EC-7", () => {
    docsState = { data: undefined, isLoading: false, isError: true, error: new Error("boom") };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows 'Repository not cloned' without the Preview/Edit toggle when there is no clone — EC-1", () => {
    docsState = {
      data: { cloned: false, documents: [], total: 0, scanned_at: new Date().toISOString() },
      isLoading: false,
      isError: false,
      error: undefined,
    };
    renderView();
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("selects a document, edits it, guards the switch with a confirm dialog, and saves — AC-8, AC-64, AC-65, AC-72, EC-23", () => {
    renderView();

    // AC-8: selecting a file renders its Markdown preview.
    fireEvent.click(screen.getByText("a.md"));
    expect(screen.getByRole("heading", { name: "A" })).toBeInTheDocument();

    // AC-14: a Preview/Edit toggle, and no file-management controls.
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.queryByText(/new file/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new folder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();

    // AC-64: switching to Edit shows the raw text in a textarea.
    fireEvent.click(screen.getByText("Edit"));
    const textarea = document.querySelector("textarea")!;
    expect(textarea).toHaveValue("# A\n\nBody A.");

    // Dirty the draft, then try to switch files — EC-23 guards it.
    fireEvent.change(textarea, { target: { value: "# A changed" } });
    fireEvent.click(screen.getByText("b.md"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Cancel keeps the edited text and the dialog closes.
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("textarea")).toHaveValue("# A changed");

    // AC-65 / AC-72: Save sends the path and text, then switches to Preview
    // with the saved content and the "Saved" confirmation.
    fireEvent.click(screen.getByText("Save"));
    expect(saveMutateSpy).toHaveBeenCalledWith(
      { path: "docs/a.md", text: "# A changed" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole("heading", { name: "A changed" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Now confirm the discard path: edit again, switch to b.md, Confirm.
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "# A re-edited" } });
    fireEvent.click(screen.getByText("b.md"));
    fireEvent.click(screen.getByText("Discard"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "B" })).toBeInTheDocument();
  });

  it("keeps the edited text and shows an error with Retry on a save failure — AC-68", () => {
    renderView();
    fireEvent.click(screen.getByText("a.md"));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "# A changed" } });

    saveBehavior = "error";
    fireEvent.click(screen.getByText("Save"));

    expect(document.querySelector("textarea")).toHaveValue("# A changed");
    expect(screen.getByText("500 Internal Server Error")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(saveMutateSpy).toHaveBeenCalledTimes(2);
  });
});
