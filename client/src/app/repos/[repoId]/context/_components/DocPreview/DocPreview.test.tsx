import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocumentContent, ProjectDocumentUsage } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/projectContext.json";
import { DocPreview } from "./DocPreview";

afterEach(cleanup);

const DOC: ProjectDocumentContent = {
  path: "docs/a.md",
  bucket: "docs",
  estimated_tokens: 120,
  text: "# Hello\n\nSome body text.",
};

const USAGE: ProjectDocumentUsage = {
  path: "docs/a.md",
  agents: [{ id: "ag1", name: "Security Reviewer" }],
  skills: [{ id: "sk1", name: "Conventions" }],
};

function renderPreview(over: Partial<React.ComponentProps<typeof DocPreview>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <DocPreview
        doc={DOC}
        isLoading={false}
        isError={false}
        usage={USAGE}
        {...over}
      />
    </NextIntlClientProvider>,
  );
}

describe("DocPreview", () => {
  it("renders the document's Markdown, its token count and usage links to the agent/skill editors — AC-8, AC-10, AC-34", () => {
    renderPreview();
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("Some body text.")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tokens")).toBeInTheDocument();

    const agentLink = screen.getByRole("link", { name: "Security Reviewer" });
    expect(agentLink).toHaveAttribute("href", "/agents/ag1?tab=context");
    const skillLink = screen.getByRole("link", { name: "Conventions" });
    expect(skillLink).toHaveAttribute("href", "/skills/sk1?tab=context");
  });

  it("shows the Saved confirmation when told to, and 'not found' instead of crashing on a missing document", () => {
    renderPreview({ saved: true });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    cleanup();

    renderPreview({ doc: undefined, isError: true });
    expect(screen.getByText("Document not found.")).toBeInTheDocument();
  });

  it("renders hostile Markdown as inert text — no <script>, no active javascript: link — UT-4", () => {
    renderPreview({
      doc: {
        ...DOC,
        text: '# Title\n\n<script>alert(1)</script>\n\n[click me](javascript:alert(1))',
      },
    });
    expect(document.querySelector("script")).not.toBeInTheDocument();
    // A stripped `javascript:` href drops the anchor's accessible "link" role
    // (no href attribute left) — assert on the DOM directly instead.
    expect(screen.getByText("click me")).toBeInTheDocument();
    for (const a of document.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
  });
});
