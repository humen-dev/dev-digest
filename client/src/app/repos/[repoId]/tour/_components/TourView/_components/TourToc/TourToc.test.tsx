import { useRef, useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourSectionKind } from "@devdigest/shared";
import { TOUR_SECTION_ORDER } from "../../../TourSections";
import { TourToc } from "./TourToc";

afterEach(cleanup);

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
}

function Harness() {
  const sectionRefs = useRef<Partial<Record<TourSectionKind, HTMLElement>>>({});
  const [activeKind, setActiveKind] = useState<TourSectionKind>("architecture_overview");
  const onSelect = vi.fn((kind: TourSectionKind) => setActiveKind(kind));
  return (
    <div>
      <TourToc
        kinds={TOUR_SECTION_ORDER}
        activeKind={activeKind}
        onSelect={onSelect}
        sectionRefs={sectionRefs}
        onActiveChange={setActiveKind}
      />
      {TOUR_SECTION_ORDER.map((kind) => (
        <section
          key={kind}
          id={kind}
          ref={(el) => {
            if (el) sectionRefs.current[kind] = el;
          }}
        />
      ))}
    </div>
  );
}

function renderToc() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <Harness />
    </NextIntlClientProvider>,
  );
}

describe("TourToc", () => {
  it("renders a labelled navigation landmark with 5 links in order, the active one current — AC-4, NFR-9", () => {
    renderToc();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "true");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(nav).toContainElement(links[0]!);
  });

  it("calls onSelect without a real navigation when a link is clicked — AC-6, AC-7", () => {
    renderToc();
    const link = screen.getByRole("link", { name: "How to run locally" });
    fireEvent.click(link);
    expect(screen.getByRole("link", { name: "How to run locally" })).toHaveAttribute("aria-current", "true");
  });

  it("moves aria-current to the topmost intersecting section on a stubbed observer event — AC-8", () => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver as unknown as typeof IntersectionObserver);

    renderToc();
    const observer = FakeIntersectionObserver.instances[0]!;
    const target = document.getElementById("guided_reading")!;

    act(() => {
      observer.callback(
        [{ isIntersecting: true, target, boundingClientRect: { top: 10 } } as unknown as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(screen.getByRole("link", { name: "Guided reading path" })).toHaveAttribute("aria-current", "true");

    vi.unstubAllGlobals();
  });
});
