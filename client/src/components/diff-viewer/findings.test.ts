import { describe, it, expect } from "vitest";
import { anchorMarkers, markersForPath, worstSeverity, type DiffFindingMarker } from "./findings";

function marker(partial: Partial<DiffFindingMarker> & Pick<DiffFindingMarker, "id" | "severity" | "line">): DiffFindingMarker {
  return { path: "src/a.ts", card: null, ...partial };
}

describe("markersForPath", () => {
  it("keeps only markers for the given path, most severe first (ties by id)", () => {
    const overlay = {
      markers: [
        marker({ id: "1", severity: "SUGGESTION", line: 3, path: "src/a.ts" }),
        marker({ id: "2", severity: "CRITICAL", line: 5, path: "src/b.ts" }),
        marker({ id: "3", severity: "WARNING", line: 7, path: "src/a.ts" }),
        marker({ id: "4", severity: "CRITICAL", line: 9, path: "src/a.ts" }),
      ],
    };
    const result = markersForPath(overlay, "src/a.ts");
    expect(result.map((m) => m.id)).toEqual(["4", "3", "1"]);
  });

  it("returns an empty array when the overlay is undefined", () => {
    expect(markersForPath(undefined, "src/a.ts")).toEqual([]);
  });
});

describe("anchorMarkers", () => {
  it("buckets markers by rendered RIGHT line, stacking each line most-severe-first", () => {
    const markers = [
      marker({ id: "w", severity: "WARNING", line: 10 }),
      marker({ id: "c", severity: "CRITICAL", line: 10 }),
      marker({ id: "s", severity: "SUGGESTION", line: 20 }),
    ];
    const { byLine, unanchored } = anchorMarkers(markers, new Set([10, 20]));
    expect(byLine.get(10)!.map((m) => m.id)).toEqual(["c", "w"]);
    expect(byLine.get(20)!.map((m) => m.id)).toEqual(["s"]);
    expect(unanchored).toEqual([]);
  });

  it("puts a marker whose line isn't rendered (or the file has no patch) into unanchored", () => {
    const markers = [
      marker({ id: "in", severity: "WARNING", line: 5 }),
      marker({ id: "out", severity: "CRITICAL", line: 99 }),
    ];
    const { byLine, unanchored } = anchorMarkers(markers, new Set([5]));
    expect(byLine.get(5)!.map((m) => m.id)).toEqual(["in"]);
    expect(unanchored.map((m) => m.id)).toEqual(["out"]);
  });

  it("puts every marker into unanchored when there are no rendered lines at all", () => {
    const markers = [marker({ id: "a", severity: "CRITICAL", line: 1 })];
    const { byLine, unanchored } = anchorMarkers(markers, new Set());
    expect(byLine.size).toBe(0);
    expect(unanchored.map((m) => m.id)).toEqual(["a"]);
  });
});

describe("worstSeverity", () => {
  it("returns the most severe severity present", () => {
    expect(
      worstSeverity([
        marker({ id: "1", severity: "SUGGESTION", line: 1 }),
        marker({ id: "2", severity: "WARNING", line: 1 }),
      ]),
    ).toBe("WARNING");
  });

  it("returns null for an empty list", () => {
    expect(worstSeverity([])).toBeNull();
  });
});
