import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { layoutBlastGraph, truncateLabel, edgePath } from "./helpers";
import { MAX_LABEL_CHARS, MAX_NODES_PER_COLUMN, NODE_H, NODE_W, PAD, ROW_H, COL_X } from "./constants";

function data(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [],
    downstream: [
      {
        symbol: "a",
        callers: [
          { name: "shared", file: "src/s.ts", line: 1 },
          { name: "onlyA", file: "src/oa.ts", line: 2 },
        ],
        endpoints_affected: ["GET /x"],
        crons_affected: ["nightly"],
      },
      {
        symbol: "b",
        callers: [{ name: "shared", file: "src/s.ts", line: 9 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "",
    stats: { symbols: 2, callers: 3, endpoints: 1, crons: 1 },
    unattributed_endpoints: [],
    degraded: false,
    reason: null,
    ...over,
  };
}

describe("layoutBlastGraph", () => {
  it("dedupes shared callers, draws caller->endpoint edges only from facts, orders crons last", () => {
    const withFacts = layoutBlastGraph(
      data({ caller_file_facts: { "src/s.ts": { endpoints: ["GET /x"], crons: ["nightly"] } } }),
    );
    expect(withFacts.nodes.filter((n) => n.kind === "caller")).toHaveLength(2);
    // the shared caller is linked from both symbols
    expect(withFacts.edges.filter((e) => e.to === "caller:shared|src/s.ts")).toHaveLength(2);
    const targets = withFacts.nodes.filter((n) => n.kind === "endpoint" || n.kind === "cron");
    expect(targets.map((n) => n.kind)).toEqual(["endpoint", "cron"]);
    expect(withFacts.edges.map((e) => e.to)).toContain("endpoint:GET /x");
    expect(withFacts.unattributed).toBe(0);
    expect(withFacts.height).toBe(2 * ROW_H + 2 * PAD);

    const noFacts = layoutBlastGraph(data());
    expect(noFacts.nodes.some((n) => n.kind === "endpoint" || n.kind === "cron")).toBe(false);
    expect(noFacts.edges).toHaveLength(3);
    expect(noFacts.unattributed).toBe(1);
  });

  it("prefers per-caller caller_facts over the raw per-file facts", () => {
    const layout = layoutBlastGraph(
      data({
        downstream: [
          {
            symbol: "money",
            callers: [
              { name: "createInvoice", file: "src/routes/invoices.ts", line: 1 },
              { name: "previewTax", file: "src/routes/invoices.ts", line: 2 },
            ],
            endpoints_affected: ["POST /api/invoices", "GET /api/invoices/tax"],
            crons_affected: [],
          },
        ],
        caller_file_facts: {
          "src/routes/invoices.ts": { endpoints: ["POST /api/invoices", "GET /api/invoices/tax"], crons: [] },
        },
        caller_facts: [
          { name: "createInvoice", file: "src/routes/invoices.ts", endpoints: ["POST /api/invoices"], crons: [] },
          { name: "previewTax", file: "src/routes/invoices.ts", endpoints: ["GET /api/invoices/tax"], crons: [] },
        ],
      }),
    );
    const factEdges = layout.edges.filter((e) => e.to.startsWith("endpoint:")).map((e) => `${e.from} -> ${e.to}`);
    expect(factEdges.sort()).toEqual([
      "caller:createInvoice|src/routes/invoices.ts -> endpoint:POST /api/invoices",
      "caller:previewTax|src/routes/invoices.ts -> endpoint:GET /api/invoices/tax",
    ]);
    expect(layout.unattributed).toBe(0);
  });

  it("collapses overflow into a more node and drops edges to hidden nodes", () => {
    const many = Array.from({ length: MAX_NODES_PER_COLUMN + 3 }, (_, i) => ({
      name: `c${i}`,
      file: `src/c${i}.ts`,
      line: 1,
    }));
    const layout = layoutBlastGraph(
      data({
        downstream: [{ symbol: "a", callers: many, endpoints_affected: [], crons_affected: [] }],
      }),
    );
    const more = layout.nodes.filter((n) => n.kind === "more");
    expect(more).toHaveLength(1);
    expect(more[0]?.full).toBe("3");
    expect(layout.edges).toHaveLength(MAX_NODES_PER_COLUMN);
  });

  it("returns an empty layout for no downstream symbols", () => {
    const layout = layoutBlastGraph(data({ downstream: [] }));
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });
});

describe("truncateLabel / edgePath", () => {
  it("ellipsises long labels and keeps short ones", () => {
    expect(truncateLabel("short")).toBe("short");
    const out = truncateLabel("x".repeat(MAX_LABEL_CHARS + 5));
    expect(out).toHaveLength(MAX_LABEL_CHARS);
    expect(out.endsWith("…")).toBe(true);
  });

  it("builds a deterministic cubic path from right edge to left edge", () => {
    const a = { id: "a", kind: "symbol", label: "", full: "", x: COL_X[0], y: PAD, width: NODE_W } as const;
    const b = {
      id: "b",
      kind: "caller",
      label: "",
      full: "",
      x: COL_X[1],
      y: PAD + ROW_H,
      width: NODE_W,
    } as const;
    const x1 = COL_X[0] + NODE_W;
    const mx = (x1 + COL_X[1]) / 2;
    const y1 = PAD + NODE_H / 2;
    const y2 = PAD + ROW_H + NODE_H / 2;
    expect(edgePath(a, b)).toBe(`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${COL_X[1]} ${y2}`);
  });

  it("keeps the full text on truncated nodes", () => {
    const long = "y".repeat(60);
    const layout = layoutBlastGraph(
      data({ downstream: [{ symbol: long, callers: [], endpoints_affected: [], crons_affected: [] }] }),
    );
    expect(layout.nodes[0]?.full).toBe(long);
    expect(layout.nodes[0]?.label).not.toBe(long);
  });
});
