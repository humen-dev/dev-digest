import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import type { TourStep } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import { HowToRun } from "./HowToRun";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

const STEPS: TourStep[] = [
  { command: "pnpm install", note: null, source: "package.json" },
  { command: "cp .env.example .env", note: "add OPENAI + STRIPE keys", source: ".env.example" },
  { command: "docker compose up -d postgres", note: null, source: "docker-compose.yml" },
  { command: "pnpm dev", note: "starts the dev server", source: "package.json" },
];

describe("HowToRun", () => {
  it("renders every step part, copies a step's command alone, copies all 4 as lines, and clears 'Copied' after 2 s — AC-18, AC-19, AC-20, AC-21", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithProviders(<HowToRun steps={STEPS} />);

    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    expect(screen.getByText("starts the dev server")).toBeInTheDocument();
    expect(screen.getAllByText("package.json")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Copy step 4" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("pnpm dev");
    expect(screen.getByText("Copied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenLastCalledWith(
      "pnpm install\ncp .env.example .env\ndocker compose up -d postgres\npnpm dev",
    );
  });

  it("toasts 'Couldn't copy to clipboard' when the write is rejected — EC-22", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithProviders(<HowToRun steps={STEPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy step 1" }));

    expect(await screen.findByText("Couldn't copy to clipboard")).toBeInTheDocument();
  });
});
