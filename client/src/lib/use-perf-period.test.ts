import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/agent-performance",
  useSearchParams: () => new URLSearchParams(search),
}));

import { usePerfPeriod } from "./use-perf-period";

beforeEach(() => {
  replace.mockReset();
  search = "sort=accept&range=1d";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function lastUrl(): URL {
  return new URL(replace.mock.calls[0]![0] as string, "http://x");
}

describe("usePerfPeriod — SPEC-09 AC-9..AC-11", () => {
  it("parses the initial state from the URL and resolves a 1d period ending now", () => {
    const { result } = renderHook(() => usePerfPeriod());
    expect(result.current.state).toEqual({ range: "1d" });
    expect(result.current.period.to).toBe(new Date(2026, 9, 15, 12, 0, 0).toISOString());
  });

  it("selectPreset writes range and keeps the other params", () => {
    const { result } = renderHook(() => usePerfPeriod());
    act(() => result.current.selectPreset("30d"));
    expect(replace).toHaveBeenCalledTimes(1);
    const url = lastUrl();
    expect(url.pathname).toBe("/agent-performance");
    expect(url.searchParams.get("range")).toBe("30d");
    expect(url.searchParams.get("sort")).toBe("accept");
  });

  it("applyCustom writes range, from and to, keeping other params", () => {
    const { result } = renderHook(() => usePerfPeriod());
    let err: unknown = "unset";
    act(() => {
      err = result.current.applyCustom("2026-10-01", "2026-10-15");
    });
    expect(err).toBeNull();
    const url = lastUrl();
    expect(url.searchParams.get("range")).toBe("custom");
    expect(url.searchParams.get("from")).toBe("2026-10-01");
    expect(url.searchParams.get("to")).toBe("2026-10-15");
    expect(url.searchParams.get("sort")).toBe("accept");
  });

  it("returns the error kind and leaves the URL untouched for an invalid custom range", () => {
    const { result } = renderHook(() => usePerfPeriod());
    const cases: [string, string, string][] = [
      ["2026-10-10", "2026-10-01", "order"],
      ["2026-10-10", "2026-10-16", "future"],
      ["2025-10-14", "2026-10-15", "tooLong"],
    ];
    for (const [from, to, kind] of cases) {
      let err: unknown;
      act(() => {
        err = result.current.applyCustom(from, to);
      });
      expect(err).toBe(kind);
    }
    expect(replace).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ range: "1d" });
  });
});
