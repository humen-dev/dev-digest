import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalAgentDetail, EvalRunDetail, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import commonMessages from "../../../../messages/en/common.json";
import { api, ApiError } from "@/lib/api";
import { RunEvalControl } from "./RunEvalControl";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const RECORD: EvalRunRecord = {
  id: "run1",
  agent_id: "ag1",
  agent_name: "Security",
  agent_version: 2,
  skills_fingerprint: [],
  skills_delta: false,
  status: "running",
  error_reason: null,
  started_at: "2026-10-09T10:00:00.000Z",
  finished_at: null,
  duration_ms: null,
  cost_usd: null,
  case_ids: ["c1"],
  metrics: null,
};

const DETAIL: EvalAgentDetail = {
  agent_id: "ag1",
  agent_name: "Security",
  model: "m",
  cases_total: 8,
  running: null,
  latest: null,
  previous: null,
  runs: [],
  trend: [],
  banner: null,
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

afterEach(() => {
  cleanup();
});

function renderControl(detail: EvalAgentDetail) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (d: EvalAgentDetail) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
        <RunEvalControl agentId="ag1" detail={d} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(ui(detail));
  return { rerenderWith: (d: EvalAgentDetail) => view.rerender(ui(d)) };
}

describe("RunEvalControl", () => {
  it("confirms with the estimated case count before any POST — AC-31", async () => {
    vi.mocked(api.get).mockResolvedValue({ agent_id: "ag1", cases_total: 8 });
    vi.mocked(api.post).mockResolvedValue({ run_id: "run1", status: "running" });
    renderControl(DETAIL);

    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(await screen.findByText("This will run 8 cases. Continue?")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    // the start button is replaced by the confirm button with the same label
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/agents/ag1/eval-runs"));
  });

  it("cancelling the confirmation never POSTs", async () => {
    vi.mocked(api.get).mockResolvedValue({ agent_id: "ag1", cases_total: 3 });
    renderControl(DETAIL);
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await screen.findByText("This will run 3 cases. Continue?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeInTheDocument();
  });

  it("shows the reason for a 409 next to the action — AC-74", async () => {
    vi.mocked(api.get).mockResolvedValue({ agent_id: "ag1", cases_total: 2 });
    vi.mocked(api.post).mockRejectedValue(new ApiError("x", 409, "run_in_flight"));
    renderControl(DETAIL);
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await screen.findByText("This will run 2 cases. Continue?");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A run is already in progress for this agent");
  });

  it("shows a running indicator instead of the start action, then announces completion — EC-25, NFR-13", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...RECORD, per_case: [] } satisfies EvalRunDetail);
    renderControl({ ...DETAIL, running: RECORD });

    expect(screen.queryByRole("button", { name: "Run all evals" })).not.toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Run in progress");
  });

  it("announces 'completed' once the polled run finishes — NFR-13", async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...RECORD,
      status: "completed",
      finished_at: "2026-10-09T10:01:00.000Z",
      per_case: [],
    } satisfies EvalRunDetail);
    const { rerenderWith } = renderControl({ ...DETAIL, running: RECORD });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("completed"));
    await act(async () => {
      rerenderWith({ ...DETAIL, running: null });
    });
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeInTheDocument();
  });

  it("keeps the last state and says so when a poll fails — NFR-13", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError("down", 500, "boom"));
    renderControl({ ...DETAIL, running: RECORD });
    expect(await screen.findByText("Could not refresh the run status")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});
