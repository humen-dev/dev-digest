import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const CANDIDATE: ConventionCandidate = {
  id: "cv1",
  repo_id: "r1",
  rule: "Route handlers return typed DTOs, never raw rows",
  rationale: "Keeps the HTTP contract independent of the schema.",
  category: "api",
  evidence_path: "src/modules/pulls/routes.ts",
  evidence_line: 42,
  evidence_snippet: "return toPrDto(row);\nreturn reply.send(dto);",
  occurrences: 7,
  confidence: 0.91,
  status: "pending",
  created_at: "2026-09-23T10:00:00Z",
};

function renderCard(over: Partial<ConventionCandidate> = {}, onPatch = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={{ ...CANDIDATE, ...over }}
        repoFullName="humen-dev/support-platform"
        gitRef="abc123"
        onPatch={onPatch}
      />
    </NextIntlClientProvider>,
  );
  return onPatch;
}

afterEach(cleanup);

describe("ConventionCard", () => {
  it("shows the rule, evidence range, frequency and confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/modules/pulls/routes.ts:42-43")).toBeInTheDocument();
    expect(screen.getByText("found in 7 files")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/humen-dev/support-platform/blob/abc123/src/modules/pulls/routes.ts#L42-L43",
    );
  });

  it("accepts and rejects through the patch callback", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByText("Accept"));
    expect(onPatch).toHaveBeenCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByText("Reject"));
    expect(onPatch).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("toggles an accepted candidate back to pending", () => {
    const onPatch = renderCard({ status: "accepted" });
    fireEvent.click(screen.getByText("Accepted"));
    expect(onPatch).toHaveBeenCalledWith({ status: "pending" });
  });

  it("offers Undo instead of triage on a rejected candidate", () => {
    const onPatch = renderCard({ status: "rejected" });
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Undo"));
    expect(onPatch).toHaveBeenCalledWith({ status: "pending" });
  });

  it("edits rule, rationale and category inline", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "Handlers return DTOs" } });
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rationale!), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "structure" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onPatch).toHaveBeenCalledWith({
      rule: "Handlers return DTOs",
      rationale: null,
      category: "structure",
    });
  });

  it("drops inline edits on cancel", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "nope" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
