import type { BlastRadiusResponse } from "@devdigest/shared";
import { COL_X, MAX_LABEL_CHARS, MAX_NODES_PER_COLUMN, NODE_H, NODE_W, PAD, ROW_H, VIEW_W } from "./constants";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron" | "more";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Truncated text drawn in the node (empty for "more"). */
  label: string;
  /** Original text (tooltip). For "more" nodes, the hidden count as a string. */
  full: string;
  x: number;
  y: number;
  width: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  d: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Endpoints of the change with no caller edge — not drawn. */
  unattributed: number;
}

export function truncateLabel(text: string, max: number = MAX_LABEL_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Cubic curve from the right edge of `a` to the left edge of `b`. */
export function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.width;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

interface RawNode {
  id: string;
  kind: Exclude<GraphNodeKind, "more">;
  text: string;
}

/** Positions one column, collapsing the overflow into a single "more" node. */
function placeColumn(raw: RawNode[], col: number): GraphNode[] {
  const x = COL_X[col] ?? 0;
  const shown = raw.slice(0, MAX_NODES_PER_COLUMN);
  const nodes: GraphNode[] = shown.map((n, i) => ({
    id: n.id,
    kind: n.kind,
    label: truncateLabel(n.text),
    full: n.text,
    x,
    y: PAD + i * ROW_H,
    width: NODE_W,
  }));
  const hidden = raw.length - shown.length;
  if (hidden > 0) {
    nodes.push({
      id: `more:${col}`,
      kind: "more",
      label: "",
      full: String(hidden),
      x,
      y: PAD + shown.length * ROW_H,
      width: NODE_W,
    });
  }
  return nodes;
}

type CallerFacts = { endpoints: string[]; crons: string[] };

/** Graph node id of a caller — shared by the node builder and the facts lookup. */
export const callerNodeId = (name: string, file: string) => `caller:${name}|${file}`;

/**
 * Resolves a caller node's endpoints/crons. Prefers its per-caller `caller_facts`
 * entry; a caller without one (or an older response without `caller_facts`)
 * falls back to the raw facts of its file.
 */
function callerFactsLookup(data: BlastRadiusResponse): (c: { id: string; file: string }) => CallerFacts | undefined {
  const byCaller = new Map((data.caller_facts ?? []).map((f) => [callerNodeId(f.name, f.file), f]));
  const byFile = data.caller_file_facts ?? {};
  return (c) => byCaller.get(c.id) ?? byFile[c.file];
}

/** Pure layout of the direct blast radius: symbols → callers → endpoints/crons. */
export function layoutBlastGraph(data: BlastRadiusResponse): GraphLayout {
  const symbols: RawNode[] = [];
  const callers = new Map<string, RawNode & { file: string }>();
  const links: Array<[string, string]> = [];

  data.downstream.forEach((group, i) => {
    const symbolId = `symbol:${i}`;
    symbols.push({ id: symbolId, kind: "symbol", text: group.symbol });
    for (const c of group.callers) {
      const id = callerNodeId(c.name, c.file);
      if (!callers.has(id)) callers.set(id, { id, kind: "caller", text: c.name, file: c.file });
      links.push([symbolId, id]);
    }
  });

  // Caller → endpoint/cron edges: per-caller `caller_facts` when present, else per-caller-file facts.
  const factsFor = callerFactsLookup(data);
  const endpointSet = new Set<string>();
  const cronSet = new Set<string>();
  for (const c of callers.values()) {
    const f = factsFor(c);
    if (!f) continue;
    for (const e of f.endpoints) {
      endpointSet.add(e);
      links.push([c.id, `endpoint:${e}`]);
    }
    for (const e of f.crons) {
      cronSet.add(e);
      links.push([c.id, `cron:${e}`]);
    }
  }
  const targets: RawNode[] = [
    ...[...endpointSet].sort().map((e): RawNode => ({ id: `endpoint:${e}`, kind: "endpoint", text: e })),
    ...[...cronSet].sort().map((e): RawNode => ({ id: `cron:${e}`, kind: "cron", text: e })),
  ];

  const columns = [placeColumn(symbols, 0), placeColumn([...callers.values()], 1), placeColumn(targets, 2)];
  const nodes = columns.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const [from, to] of links) {
    const a = byId.get(from);
    const b = byId.get(to);
    const id = `${from}->${to}`;
    if (!a || !b || seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, from, to, d: edgePath(a, b) });
  }

  const allEndpoints = new Set<string>([
    ...data.downstream.flatMap((g) => g.endpoints_affected),
    ...data.unattributed_endpoints,
  ]);
  const unattributed = [...allEndpoints].filter((e) => !endpointSet.has(e)).length;

  const rows = Math.max(0, ...columns.map((c) => c.length));
  return { width: VIEW_W, height: rows * ROW_H + 2 * PAD, nodes, edges, unattributed };
}
