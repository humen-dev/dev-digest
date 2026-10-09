import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { api, ApiError } from "@/lib/api";
import { EvalCaseAction } from "./EvalCaseAction";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

afterEach(() => {
  cleanup();
  vi.mocked(api.post).mockReset();
});

function renderAction(triaged: boolean) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalCaseAction findingId="f1" triaged={triaged} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalCaseAction", () => {
  it("is disabled with a hint while the finding is untriaged — AC-3", () => {
    renderAction(false);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
    expect(screen.getByText("Accept or dismiss first")).toBeInTheDocument();
  });

  it("creates the case and becomes an 'Eval case ✓' link — AC-12", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "c1", owner_id: "ag1" });
    renderAction(true);
    const button = screen.getByRole("button", { name: "Turn into eval case" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const link = await screen.findByRole("link", { name: "Eval case ✓" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals&case=c1");
    expect(api.post).toHaveBeenCalledWith("/findings/f1/eval-case");
  });

  it("shows the reason for a 422 and keeps the button — AC-74", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError("x", 422, "diff_unavailable"));
    renderAction(true);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No diff is available for this finding's file"),
    );
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});
