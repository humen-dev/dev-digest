import { describe, it, expect } from "vitest";
import { refusalMessage, runErrorKey, runErrorValues } from "./eval-errors";

describe("eval-errors", () => {
  it("maps known codes, falls back to generic, and reads ICU values from details", () => {
    expect(runErrorKey("no_cases")).toBe("no_cases");
    expect(runErrorKey("boom")).toBe("generic");
    expect(runErrorValues({ cases_total: 7 }).count).toBe(7);
    expect(refusalMessage("provider_key_missing", { provider: "openai" })).toEqual({
      key: "provider_key_missing",
      values: { provider: "openai", count: 0 },
    });
    expect(refusalMessage("too_many_cases", { count: 60, limit: 50 }).key).toBe("too_many_cases");
    expect(refusalMessage("provider_key_missing", null).key).toBe("generic");
    expect(refusalMessage("too_many_cases", {}).key).toBe("generic");
    expect(refusalMessage("run_in_flight", { run_id: "r1" }).key).toBe("run_in_flight");
  });
});
