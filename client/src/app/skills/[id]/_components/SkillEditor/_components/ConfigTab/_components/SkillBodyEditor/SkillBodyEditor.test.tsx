import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
vi.mock("../../../../../../../../../lib/hooks/skills", () => ({
  useSkillTokens: () => ({ mutate, isPending: false }),
}));

import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillBodyEditor (smoke)", () => {
  it("shows no unsaved badge while the body matches what's saved", () => {
    renderWithIntl(
      <SkillBodyEditor name="my-skill" body="line one" savedBody="line one" initialTokens={12} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("shows the unsaved badge once the body diverges from the saved body", () => {
    renderWithIntl(
      <SkillBodyEditor
        name="my-skill"
        body="line one\nline two"
        savedBody="line one"
        initialTokens={12}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("renders one gutter line number per body line", () => {
    renderWithIntl(
      <SkillBodyEditor name="my-skill" body={"a\nb\nc"} savedBody={"a\nb\nc"} initialTokens={3} onChange={vi.fn()} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("paints a highlight layer that repeats the body under the textarea", () => {
    const body = "## Correctness\n- check the boundary";
    const { container } = renderWithIntl(
      <SkillBodyEditor name="my-skill" body={body} savedBody={body} initialTokens={7} onChange={vi.fn()} />,
    );

    // The overlay must reproduce the body verbatim — any drift here is drift
    // between the colours and the caret in the browser.
    const highlight = container.querySelector("pre");
    expect(highlight?.textContent).toBe(body);
    expect(highlight?.querySelectorAll("span").length).toBeGreaterThan(2);
    expect(container.querySelector("textarea")).toHaveValue(body);
  });

  it("shows the file name as <name>.md", () => {
    renderWithIntl(
      <SkillBodyEditor name="uncovered-branch-gate" body="" savedBody="" initialTokens={0} onChange={vi.fn()} />,
    );
    expect(screen.getByText("uncovered-branch-gate.md")).toBeInTheDocument();
  });
});
