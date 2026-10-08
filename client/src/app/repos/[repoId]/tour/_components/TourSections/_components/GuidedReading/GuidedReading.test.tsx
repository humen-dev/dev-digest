import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourReadingItem } from "@devdigest/shared";
import { GuidedReading } from "./GuidedReading";

afterEach(cleanup);

const ITEMS: TourReadingItem[] = [
  { path: "src/server.ts", reason: "See the whole request lifecycle in one file", importer_count: null },
  { path: "src/api/public/index.ts", reason: "Understand the public contract before touching it", importer_count: null },
  { path: "src/middleware/auth.ts", reason: "Auth touches almost everything downstream", importer_count: null },
];

describe("GuidedReading", () => {
  it("numbers 1-3 each entry's path (as a link) and reason — AC-22, AC-26", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <GuidedReading items={ITEMS} repoFullName="acme/widgets" tourCommit="sha1" cloned />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Auth touches almost everything downstream")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Open src/server.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/blob/sha1/src/server.ts");
  });
});
