import { describe, it, expect } from "vitest";
import { callerHref, isKnownReason } from "./helpers";

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
