import { describe, expect, it } from "vitest";
import { reorderEnabledSkills } from "./helpers";

describe("reorderEnabledSkills", () => {
  it("moves only active skills, preserving disabled links in their slots", () => {
    expect(reorderEnabledSkills(["a", "off", "b", "c"], ["a", "b", "c"], "a", "c"))
      .toEqual(["b", "off", "c", "a"]);
  });
  it("ignores disabled or removed drag sources and drop targets", () => {
    const ids = ["a", "off", "b"];
    for (const [from, to] of [["off", "b"], ["a", "off"], ["removed", "b"], ["a", "a"]]) {
      expect(reorderEnabledSkills(ids, ["a", "b"], from!, to!)).toBe(ids);
    }
  });
});
