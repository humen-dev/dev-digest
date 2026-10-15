import { describe, it, expect } from "vitest";
import type { AgentPerfRow } from "@devdigest/shared";
import { formatSeconds, nextSort, parseSort, sortRows, trendOf } from "./helpers";
import { agentIdentity } from "./_components/AgentIdentity";

function row(name: string, o: Partial<AgentPerfRow> = {}): AgentPerfRow {
  return {
    agent_id: name,
    agent_name: name,
    enabled: true,
    runs: 10,
    unpriced_runs: 0,
    total_cost_usd: 1,
    avg_cost_usd: 0.1,
    avg_duration_ms: 1000,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    decided: 0,
    accept_rate: null,
    prev_accept_rate: null,
    prev_decided: 0,
    last_run_at: null,
    recent_runs: [],
    ...o,
  };
}
const rated = (name: string, rate: number, decided: number) =>
  row(name, { accept_rate: rate, decided, accepted: Math.round(rate * decided) });
const names = (rows: AgentPerfRow[]) => rows.map((r) => r.agent_name);

describe("parseSort — AC-11, AC-43, UT-2", () => {
  it("restores a valid sort, defaults otherwise and never echoes junk", () => {
    expect(parseSort(new URLSearchParams("sort=runs&dir=asc"))).toEqual({ key: "runs", dir: "asc" });
    expect(parseSort(new URLSearchParams(""))).toEqual({ key: "accept", dir: "desc" });
    expect(parseSort(new URLSearchParams("sort=<img onerror=x>&dir=sideways"))).toEqual({
      key: "accept",
      dir: "desc",
    });
  });
});

describe("nextSort — AC-44, AC-45", () => {
  it("starts a new column descending and reverses the current one", () => {
    expect(nextSort({ key: "accept", dir: "desc" }, "runs")).toEqual({ key: "runs", dir: "desc" });
    expect(nextSort({ key: "runs", dir: "desc" }, "runs")).toEqual({ key: "runs", dir: "asc" });
  });
});

describe("sortRows — AC-42, AC-44, AC-45", () => {
  const rows = [
    rated("small-high", 1, 3),
    rated("b-mid", 0.5, 10),
    row("none-z"),
    rated("a-high", 0.9, 10),
    rated("small-low", 0.2, 2),
    row("none-a"),
    rated("a-mid", 0.5, 20),
  ];

  it("orders accept rate in three groups and keeps the tail fixed when reversed", () => {
    expect(names(sortRows(rows, { key: "accept", dir: "desc" }))).toEqual([
      "a-high",
      "a-mid",
      "b-mid",
      "small-high",
      "small-low",
      "none-a",
      "none-z",
    ]);
    expect(names(sortRows(rows, { key: "accept", dir: "asc" }))).toEqual([
      "a-mid",
      "b-mid",
      "a-high",
      "small-low",
      "small-high",
      "none-a",
      "none-z",
    ]);
  });

  it("sorts numeric columns with nulls last and ties by name", () => {
    const data = [
      row("b", { avg_cost_usd: 0.2 }),
      row("null-1", { avg_cost_usd: null }),
      row("a", { avg_cost_usd: 0.2 }),
      row("c", { avg_cost_usd: 0.5 }),
    ];
    expect(names(sortRows(data, { key: "cost", dir: "desc" }))).toEqual(["c", "a", "b", "null-1"]);
    expect(names(sortRows(data, { key: "cost", dir: "asc" }))).toEqual(["a", "b", "c", "null-1"]);
  });
});

describe("trendOf — AC-59, EC-16", () => {
  it("returns a direction only when both periods have ≥ 5 decided and the rates differ", () => {
    expect(trendOf({ ...rated("x", 0.78, 10), prev_accept_rate: 0.7, prev_decided: 8 })).toEqual({
      direction: "up",
      previousPercent: 70,
    });
    expect(trendOf({ ...rated("x", 0.6, 10), prev_accept_rate: 0.7, prev_decided: 5 })?.direction).toBe("down");
    expect(trendOf({ ...rated("x", 0.78, 10), prev_accept_rate: 0.7, prev_decided: 4 })).toBeNull();
    expect(trendOf({ ...rated("x", 0.7, 10), prev_accept_rate: 0.7, prev_decided: 10 })).toBeNull();
  });
});

describe("formatSeconds — AC-55", () => {
  it("shows seconds with one decimal", () => {
    expect(formatSeconds(6200)).toBe("6.2s");
    expect(formatSeconds(null)).toBe("—");
  });
});

describe("agentIdentity — AC-61", () => {
  it("is stable per id and neutral for the Unknown agent", () => {
    expect(agentIdentity("agent-1")).toEqual(agentIdentity("agent-1"));
    expect(agentIdentity(null).icon).toBe("User");
  });
});
