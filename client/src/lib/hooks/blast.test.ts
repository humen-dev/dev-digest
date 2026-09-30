import { describe, it, expect } from "vitest";
import { blastPollInterval } from "./blast";

describe("blastPollInterval", () => {
  const NOW = 1_000_000;

  it("polls while degraded and before the deadline", () => {
    expect(blastPollInterval(true, 3000, NOW + 1, NOW)).toBe(3000);
    expect(blastPollInterval(true, 3000, undefined, NOW)).toBe(3000);
  });

  it("stops once the answer is healthy or not loaded", () => {
    expect(blastPollInterval(false, 3000, NOW + 1, NOW)).toBe(false);
    expect(blastPollInterval(undefined, 3000, NOW + 1, NOW)).toBe(false);
  });

  it("stops at the deadline even if still degraded", () => {
    expect(blastPollInterval(true, 3000, NOW, NOW)).toBe(false);
  });

  it("never polls when polling is disabled", () => {
    expect(blastPollInterval(true, false, NOW + 1, NOW)).toBe(false);
  });
});
