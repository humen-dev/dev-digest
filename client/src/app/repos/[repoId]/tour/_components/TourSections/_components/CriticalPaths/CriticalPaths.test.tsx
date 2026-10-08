import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourPathItem } from "@devdigest/shared";
import { CriticalPaths } from "./CriticalPaths";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

const ITEMS: TourPathItem[] = [
  { path: "src/server.ts", note: "App bootstrap", importer_count: 3 },
  { path: "src/api/public/index.ts", note: "Public router", importer_count: 0 },
  { path: "src/middleware/auth.ts", note: "Token validation", importer_count: null },
  { path: "src/lib/redis.ts", note: "Shared singleton", importer_count: null },
];

describe("CriticalPaths", () => {
  it("renders one row per item with icon, path, note and a working Open link — AC-17, AC-25, UT-11", () => {
    renderWithIntl(<CriticalPaths items={ITEMS} repoFullName="acme/widgets" tourCommit="sha1" cloned />);

    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
    expect(screen.getByText("— App bootstrap")).toBeInTheDocument();
    const openLinks = screen.getAllByRole("link", { name: /^Open .* on GitHub$/ });
    expect(openLinks).toHaveLength(4);
    expect(openLinks[0]).toHaveAttribute("href", "https://github.com/acme/widgets/blob/sha1/src/server.ts");
  });

  it("shows 'imported by N files' only on the item with a positive count — AC-28, EC-29", () => {
    renderWithIntl(<CriticalPaths items={ITEMS} repoFullName="acme/widgets" tourCommit="sha1" cloned />);
    expect(screen.getByText("imported by 3 files")).toBeInTheDocument();
    expect(screen.queryByText(/imported by 0/)).not.toBeInTheDocument();
  });

  it("hides every Open link and keeps paths as plain text without a clone — EC-3", () => {
    renderWithIntl(<CriticalPaths items={ITEMS} repoFullName="acme/widgets" tourCommit="sha1" cloned={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
  });
});
