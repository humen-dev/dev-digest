import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";

afterEach(cleanup);

const DATA: BlastRadiusResponse = {
  changed_symbols: [],
  downstream: [
    {
      symbol: "formatCost",
      callers: [{ name: "renderRow", file: "src/ui/row.ts", line: 3 }],
      endpoints_affected: ["GET /api/costs", "GET /api/other"],
      crons_affected: ["nightly"],
    },
  ],
  summary: "",
  stats: { symbols: 1, callers: 1, endpoints: 2, crons: 1 },
  unattributed_endpoints: [],
  degraded: false,
  reason: null,
  caller_file_facts: { "src/ui/row.ts": { endpoints: ["GET /api/costs"], crons: ["nightly"] } },
};

function renderGraph(data: BlastRadiusResponse) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <BlastGraph data={data} />
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("renders the svg, legend and unattributed note, or the empty text", () => {
    const { unmount } = renderGraph(DATA);
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getAllByText("formatCost").length).toBeGreaterThan(0);
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints affected")).toBeInTheDocument();
    expect(screen.getByText("cron jobs")).toBeInTheDocument();
    expect(screen.getByText("1 endpoint is not linked to a caller. See the Tree view.")).toBeInTheDocument();
    unmount();

    renderGraph({ ...DATA, downstream: [] });
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
