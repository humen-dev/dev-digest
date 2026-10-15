import { describe, it, expect, afterEach } from "vitest";
import {
  parsePerfPeriod,
  validateCustomRange,
  resolvePerfPeriod,
  perfPeriodParams,
  customRangeLabel,
} from "./perf-period";
import { isSmallSample, ratePercent } from "./accept-rate";

const TODAY = new Date(2026, 9, 15, 12, 0, 0); // local noon, 15 Oct 2026
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("parsePerfPeriod — SPEC-09 AC-5, EC-21", () => {
  it("falls back to 30 days for empty, unknown and junk values", () => {
    expect(parsePerfPeriod(new URLSearchParams(""), TODAY)).toEqual({ range: "30d" });
    expect(parsePerfPeriod(new URLSearchParams("range=999d"), TODAY)).toEqual({ range: "30d" });
    expect(parsePerfPeriod(new URLSearchParams({ range: "<img onerror=x>" }), TODAY)).toEqual({ range: "30d" });
    expect(parsePerfPeriod(new URLSearchParams("range=custom&from=2026-13-40&to=2026-10-01"), TODAY)).toEqual({
      range: "30d",
    });
    expect(parsePerfPeriod(new URLSearchParams("range=custom&from=2026-10-05&to=2026-10-01"), TODAY)).toEqual({
      range: "30d",
    });
  });

  it("restores presets and a valid custom range from the URL", () => {
    expect(parsePerfPeriod(new URLSearchParams("range=1d"), TODAY)).toEqual({ range: "1d" });
    const custom = new URLSearchParams("range=custom&from=2026-10-01&to=2026-10-15");
    expect(parsePerfPeriod(custom, TODAY)).toEqual({ range: "custom", from: "2026-10-01", to: "2026-10-15" });
    expect(perfPeriodParams({ range: "custom", from: "2026-10-01", to: "2026-10-15" })).toEqual({
      range: "custom",
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(perfPeriodParams({ range: "1d" })).toEqual({ range: "1d" });
  });
});

describe("validateCustomRange — SPEC-09 AC-9", () => {
  it("reports order, future and tooLong, and accepts the 365-day / today boundaries", () => {
    expect(validateCustomRange("2026-10-10", "2026-10-01", TODAY)).toBe("order");
    expect(validateCustomRange("2026-10-10", "2026-10-16", TODAY)).toBe("future");
    expect(validateCustomRange("2025-10-14", "2026-10-15", TODAY)).toBe("tooLong"); // 367 days
    expect(validateCustomRange("2025-10-16", "2026-10-15", TODAY)).toBeNull(); // 365 days inclusive
    expect(validateCustomRange("2026-10-15", "2026-10-15", TODAY)).toBeNull();
  });
});

describe("resolvePerfPeriod — SPEC-09 AC-6..AC-8", () => {
  it("1d is exactly 24 h and 30d exactly 720 h ending now", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    expect(resolvePerfPeriod({ range: "1d" }, now)).toEqual({
      from: "2026-10-14T10:00:00.000Z",
      to: "2026-10-15T10:00:00.000Z",
    });
    expect(resolvePerfPeriod({ range: "30d" }, now)).toEqual({
      from: "2026-09-15T10:00:00.000Z",
      to: "2026-10-15T10:00:00.000Z",
    });
  });

  it("custom spans local 00:00:00.000 .. 23:59:59.999 with the local offset", () => {
    process.env.TZ = "Europe/Kyiv";
    const r = resolvePerfPeriod({ range: "custom", from: "2026-07-01", to: "2026-07-15" }, new Date());
    expect(r).toEqual({ from: "2026-07-01T00:00:00.000+03:00", to: "2026-07-15T23:59:59.999+03:00" });
    // DST-correct: winter offset differs
    const w = resolvePerfPeriod({ range: "custom", from: "2026-01-10", to: "2026-01-12" }, new Date());
    expect(w).toEqual({ from: "2026-01-10T00:00:00.000+02:00", to: "2026-01-12T23:59:59.999+02:00" });
  });
});

describe("customRangeLabel — SPEC-09 AC-12", () => {
  it("formats a range in the current year without the year, adds it otherwise", () => {
    // ICU pads the en dash with thin spaces; normalise whitespace for the assertion.
    expect(customRangeLabel("2026-10-01", "2026-10-15", "en", TODAY).replace(/\s/g, " ")).toBe("Oct 1 – 15");
    expect(customRangeLabel("2025-12-20", "2026-01-05", "en", TODAY)).toContain("2025");
  });
});

describe("accept-rate helpers — SPEC-09 AC-41, AC-73", () => {
  it("flags 1..4 decided as a small sample only", () => {
    expect([0, 1, 4, 5, 6].map(isSmallSample)).toEqual([false, true, true, false, false]);
    expect(ratePercent(11 / 101)).toBe(11);
  });
});
