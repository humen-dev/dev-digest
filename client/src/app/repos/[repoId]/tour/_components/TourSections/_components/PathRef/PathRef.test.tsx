import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { PathRef } from "./PathRef";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

describe("PathRef", () => {
  it("renders a GitHub blob link pinned to the tour commit, percent-encoded, with an accessible name — AC-25, AC-26, UT-11", () => {
    renderWithIntl(
      <PathRef path="a b/c#d.ts" repoFullName="acme/widgets" tourCommit="deadbeef" cloned>
        a b/c#d.ts
      </PathRef>,
    );
    const link = screen.getByRole("link", { name: "Open a b/c#d.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/blob/deadbeef/a%20b/c%23d.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("falls back to plain text without a clone, with a long path's full text as title — EC-3, EC-20", () => {
    const long = "src/a/very/deeply/nested/directory/structure/that/does/not/fit/in/one/row.ts";
    renderWithIntl(
      <PathRef path={long} repoFullName="acme/widgets" tourCommit="deadbeef" cloned={false}>
        {long}
      </PathRef>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const text = screen.getByText(long);
    expect(text).toHaveAttribute("title", long);
  });

  it("shows 'imported by N files' only when the count is at least 1 — AC-28, EC-29", () => {
    renderWithIntl(
      <>
        <PathRef path="src/a.ts" repoFullName="acme/widgets" tourCommit="deadbeef" cloned importerCount={3} />
        <PathRef path="src/b.ts" repoFullName="acme/widgets" tourCommit="deadbeef" cloned importerCount={0} />
      </>,
    );
    expect(screen.getByText("imported by 3 files")).toBeInTheDocument();
    expect(screen.queryByText(/imported by 0/)).not.toBeInTheDocument();
  });
});
