import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { callerHref, indirectBySymbol, isKnownReason } from "./helpers";

describe("indirectBySymbol", () => {
  it("keys indirect impact by symbol and tolerates a missing field", () => {
    const base = { downstream: [] } as unknown as BlastRadiusResponse;
    expect(indirectBySymbol(base).size).toBe(0);
    const impact = { symbol: "a", files: ["f.ts"], endpoints: ["GET /x"], crons: [] };
    expect(indirectBySymbol({ ...base, indirect: [impact] }).get("a")).toBe(impact);
  });
});

describe("callerHref", () => {
  it("pins the link to the head sha and line, or returns null without repo/sha", () => {
    const caller = { file: "src/a b/x.ts", line: 23 };
    expect(callerHref("acme/widgets", "abc123", caller)).toBe(
      "https://github.com/acme/widgets/blob/abc123/src/a%20b/x.ts#L23",
    );
    expect(callerHref(null, "abc123", caller)).toBeNull();
    expect(callerHref("acme/widgets", null, caller)).toBeNull();
  });
});

describe("isKnownReason", () => {
  it("accepts server reasons only", () => {
    expect(isKnownReason("no_data")).toBe(true);
    expect(isKnownReason("bogus")).toBe(false);
    expect(isKnownReason(null)).toBe(false);
  });
});
