import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

afterEach(cleanup);

describe("SectionCard", () => {
  it("renders a header button with aria-expanded that hides and shows its content on click — AC-3, AC-5, NFR-8", () => {
    const onToggle = () => {};
    const { rerender } = render(
      <SectionCard
        kind="critical_paths"
        icon="Activity"
        title="Critical paths"
        expanded
        onToggle={onToggle}
        isEmpty={false}
        emptyText="Nothing verified for this section. Regenerate to try again."
      >
        <p>body content</p>
      </SectionCard>,
    );

    const header = screen.getByRole("button", { name: "Critical paths" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("body content")).toBeInTheDocument();

    rerender(
      <SectionCard
        kind="critical_paths"
        icon="Activity"
        title="Critical paths"
        expanded={false}
        onToggle={onToggle}
        isEmpty={false}
        emptyText="Nothing verified for this section. Regenerate to try again."
      >
        <p>body content</p>
      </SectionCard>,
    );
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
  });

  it("shows the EC-15 empty text instead of children when the section has no items", () => {
    render(
      <SectionCard
        kind="critical_paths"
        icon="Activity"
        title="Critical paths"
        expanded
        onToggle={() => {}}
        isEmpty
        emptyText="Nothing verified for this section. Regenerate to try again."
      >
        <p>body content</p>
      </SectionCard>,
    );
    expect(screen.getByText("Nothing verified for this section. Regenerate to try again.")).toBeInTheDocument();
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
  });

  it("toggles on click", () => {
    let expanded = true;
    const onToggle = () => {
      expanded = !expanded;
    };
    render(
      <SectionCard
        kind="critical_paths"
        icon="Activity"
        title="Critical paths"
        expanded={expanded}
        onToggle={onToggle}
        isEmpty={false}
        emptyText="—"
      >
        <p>body content</p>
      </SectionCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical paths" }));
    expect(expanded).toBe(false);
  });
});
