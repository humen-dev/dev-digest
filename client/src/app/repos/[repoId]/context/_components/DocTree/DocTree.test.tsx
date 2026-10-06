import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocument } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/projectContext.json";
import { DocTree } from "./DocTree";

afterEach(cleanup);

const DOCS: ProjectDocument[] = [
  { path: "README.md", bucket: "root", estimated_tokens: 50, used_by_agents: 0 },
  { path: "docs/a.md", bucket: "docs", estimated_tokens: 20, used_by_agents: 1 },
  { path: "docs/b.md", bucket: "docs", estimated_tokens: 30, used_by_agents: 0 },
];

function renderTree(over: Partial<React.ComponentProps<typeof DocTree>> = {}) {
  const onSelect = vi.fn();
  const onRefresh = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <DocTree
        documents={DOCS}
        total={3}
        scannedAt={new Date(Date.now() - 60_000).toISOString()}
        selectedPath={null}
        onSelect={onSelect}
        onRefresh={onRefresh}
        {...over}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect, onRefresh };
}

describe("DocTree", () => {
  it("renders folder and file nodes, the scan footer, and selects a file on click — AC-7, AC-13", () => {
    const { onSelect } = renderTree();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("3 files · scanned 1m")).toBeInTheDocument();

    fireEvent.click(screen.getByText("a.md"));
    expect(onSelect).toHaveBeenCalledWith("docs/a.md");
  });

  it("shows the capped notice when the walk hit the limit, and triggers a new walk from Refresh — EC-6, AC-11", () => {
    const { onRefresh } = renderTree({ total: 600 });
    expect(screen.getByText("Showing 3 of 600")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no project documents are found, and Refresh triggers a new walk — EC-9", () => {
    const { onRefresh } = renderTree({ documents: [], total: 0 });
    expect(screen.getByText("No project documents found")).toBeInTheDocument();
    expect(screen.getByText("Add Markdown files to the repository, then Refresh.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
