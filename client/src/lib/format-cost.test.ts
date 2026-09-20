import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("renders '—' for no data (null/undefined), never '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders a genuine free-model $0 as '$0.00' (distinct from no data)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("uses 2 significant figures under a cent so sub-cent runs stay legible", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    // real cheap-model runs (~$0.00004) must not flatten to "$0.0000"
    expect(formatCost(0.0000417)).toBe("$0.000042");
    // distinct tiny costs stay distinct (both would be "$0.0002" at 4 dp)
    expect(formatCost(0.00017537982)).toBe("$0.00018");
    expect(formatCost(0.00024836)).toBe("$0.00025");
  });

  it("uses 3 dp at or above a cent", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
  });
});
