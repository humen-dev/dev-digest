import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourArchitecture } from "@devdigest/shared";
import { ArchitectureSection } from "./ArchitectureSection";

let order: string[] = [];
let parseResult = true;
const initialize = vi.fn((opts: unknown) => {
  order.push("initialize");
  return opts;
});
const parse = vi.fn(async () => {
  order.push("parse");
  return parseResult;
});
const render_ = vi.fn(async () => {
  order.push("render");
  return { svg: "<svg></svg>" };
});

vi.mock("mermaid", () => ({
  default: {
    initialize: (opts: unknown) => initialize(opts),
    parse: () => parse(),
    render: () => render_(),
  },
}));

afterEach(() => {
  cleanup();
  order = [];
  parseResult = true;
  initialize.mockClear();
  parse.mockClear();
  render_.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

const BASE: TourArchitecture = { overview: "", overview_paths: [], diagram: null };

describe("ArchitectureSection", () => {
  it("renders Markdown bold/code and a marked path span as a PathRef chip link — AC-13, AC-15", () => {
    const architecture: TourArchitecture = {
      overview: "The **gateway** calls `src/server.ts` to boot.",
      overview_paths: ["src/server.ts"],
      diagram: null,
    };
    renderWithIntl(<ArchitectureSection architecture={architecture} repoFullName="acme/widgets" tourCommit="sha1" cloned />);

    expect(screen.getByText("gateway").tagName).toBe("STRONG");
    const chip = screen.getByRole("link", { name: "Open src/server.ts on GitHub" });
    expect(chip).toHaveAttribute("href", "https://github.com/acme/widgets/blob/sha1/src/server.ts");
  });

  it("renders a hostile overview as inert text — no <script>, no javascript: href — UT-9", () => {
    const architecture: TourArchitecture = {
      ...BASE,
      overview: "<script>alert(1)</script> and [x](javascript:alert(1))",
    };
    renderWithIntl(<ArchitectureSection architecture={architecture} repoFullName="acme/widgets" tourCommit="sha1" cloned />);

    expect(document.querySelector("script")).toBeNull();
    const maybeLink = screen.queryByRole("link", { name: "x" });
    if (maybeLink) expect(maybeLink.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
  });

  it("validates a diagram at strict security level before rendering, and omits it (no error) when invalid or absent — AC-65, EC-28, UT-10", async () => {
    const withDiagram: TourArchitecture = { ...BASE, diagram: "flowchart LR\nA-->B" };
    const first = renderWithIntl(
      <ArchitectureSection architecture={withDiagram} repoFullName="acme/widgets" tourCommit="sha1" cloned />,
    );
    await waitFor(() => expect(order).toEqual(["initialize", "parse", "render"]));
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict" }));
    first.unmount();

    // Invalid diagram text → parse rejects it → no diagram container, no error text.
    order = [];
    parseResult = false;
    const invalid: TourArchitecture = { ...BASE, diagram: "flowchart LR A-->" };
    const second = renderWithIntl(
      <ArchitectureSection architecture={invalid} repoFullName="acme/widgets" tourCommit="sha1" cloned />,
    );
    await waitFor(() => expect(order).toContain("parse"));
    expect(document.querySelector("svg")).toBeNull();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    second.unmount();

    // null diagram → no diagram area at all, mermaid never invoked.
    order = [];
    const none: TourArchitecture = { ...BASE, diagram: null };
    renderWithIntl(<ArchitectureSection architecture={none} repoFullName="acme/widgets" tourCommit="sha1" cloned />);
    expect(document.querySelector("svg")).toBeNull();
    expect(order).toEqual([]);
  });
});
