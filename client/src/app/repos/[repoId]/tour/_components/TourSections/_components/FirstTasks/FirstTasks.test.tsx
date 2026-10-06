import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourTask } from "@devdigest/shared";
import { FirstTasks } from "./FirstTasks";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

const TASKS: TourTask[] = [
  { title: "Add a /health readiness probe", target: "src/api/public/health.ts", complexity: "low", new_file: true },
  { title: "Backfill tests for the rate limiter", target: "test/ratelimit.test.ts", complexity: "medium", new_file: false },
  { title: "Document the webhook signature flow", target: "specs/", complexity: "high", new_file: false },
];

describe("FirstTasks", () => {
  it("renders one card per task with its complexity badge and colour token — AC-23", () => {
    renderWithIntl(<FirstTasks tasks={TASKS} />);

    const low = screen.getByText("Low complexity");
    const medium = screen.getByText("Medium complexity");
    const high = screen.getByText("High complexity");
    expect(low).toBeInTheDocument();
    expect((medium.closest("span") as HTMLElement).style.color).toBe("var(--warn)");
    expect((high.closest("span") as HTMLElement).style.color).toBe("var(--crit)");
    expect((low.closest("span") as HTMLElement).style.color).toBe("var(--ok)");
  });

  it("shows the 'new file' badge only on the task whose target is new — AC-24", () => {
    renderWithIntl(<FirstTasks tasks={TASKS} />);
    expect(screen.getAllByText("new file")).toHaveLength(1);

    const newCard = screen.getByText("Add a /health readiness probe").closest("article");
    expect(newCard).not.toBeNull();
    expect(within(newCard as HTMLElement).getByText("new file")).toBeInTheDocument();

    const unchangedCard = screen.getByText("Backfill tests for the rate limiter").closest("article");
    expect(unchangedCard).not.toBeNull();
    expect(within(unchangedCard as HTMLElement).queryByText("new file")).not.toBeInTheDocument();
  });
});
