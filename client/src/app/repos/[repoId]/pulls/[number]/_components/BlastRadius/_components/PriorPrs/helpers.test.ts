import { describe, it, expect } from "vitest";
import { mergedDate, overlapPreview } from "./helpers";

describe("PriorPrs helpers", () => {
  it("mergedDate formats valid ISO dates and falls back for invalid ones", () => {
    expect(mergedDate("2026-03-14T23:59:00Z")).toBe("2026-03-14");
    expect(mergedDate("not a date")).toBe("—");
  });

  it("overlapPreview caps shown files and counts the rest", () => {
    expect(overlapPreview(["a", "b"], 3)).toEqual({ shown: ["a", "b"], more: 0 });
    expect(overlapPreview(["a", "b", "c", "d", "e"], 3)).toEqual({ shown: ["a", "b", "c"], more: 2 });
  });
});
