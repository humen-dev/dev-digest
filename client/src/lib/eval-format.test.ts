import { describe, it, expect } from "vitest";
import {
  deltaTone,
  formatDeltaPoints,
  formatPercent,
  formatRunCost,
  formatVersionLabel,
} from "./eval-format";

describe("eval-format", () => {
  it("formats percent, deltas, cost and version labels; null is n/a, never 0", () => {
    expect(formatPercent(0.833, "n/a")).toBe("83%");
    expect(formatPercent(0, "n/a")).toBe("0%");
    expect(formatPercent(null, "n/a")).toBe("n/a");

    expect(formatDeltaPoints(0.035)).toBe("+3.5");
    expect(formatDeltaPoints(-0.02)).toBe("−2");
    expect(formatDeltaPoints(0)).toBe("0");
    expect(formatDeltaPoints(null)).toBeNull();
    expect(deltaTone(-0.1)).toBe("down");
    expect(deltaTone(null)).toBe("flat");

    expect(formatRunCost(null)).toBe("—");
    expect(formatRunCost(0.014)).toBe("$0.014");

    const t = (k: string, v: { version: number }) => `${k}:${v.version}`;
    expect(formatVersionLabel(3, false, t)).toBe("versionLabel:3");
    expect(formatVersionLabel(3, true, t)).toBe("versionSkillsDelta:3");
  });
});
