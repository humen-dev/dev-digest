"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parsePerfPeriod,
  perfPeriodParams,
  resolvePerfPeriod,
  validateCustomRange,
  type CustomRangeError,
  type PerfPeriodState,
} from "./perf-period";

/**
 * URL-bound period selection. Presets are resolved against `now` once per
 * selection (not per render), so the query key stays stable and Retry repeats
 * the same period. An invalid custom range is returned as an error and the URL
 * is left untouched.
 */
export function usePerfPeriod(): {
  state: PerfPeriodState;
  period: { from: string; to: string };
  selectPreset(r: "1d" | "30d"): void;
  applyCustom(from: string, to: string): CustomRangeError | null;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [anchor, setAnchor] = useState(() => new Date());

  const query = searchParams?.toString() ?? "";
  const state = useMemo(() => parsePerfPeriod(new URLSearchParams(query), new Date()), [query]);
  const period = useMemo(
    () => resolvePerfPeriod(state, anchor),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fields, not the object identity
    [state.range, state.from, state.to, anchor],
  );

  const write = useCallback(
    (next: PerfPeriodState) => {
      const sp = new URLSearchParams(query);
      for (const k of ["range", "from", "to"]) sp.delete(k);
      for (const [k, v] of Object.entries(perfPeriodParams(next))) sp.set(k, v);
      setAnchor(new Date());
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [query, pathname, router],
  );

  const selectPreset = useCallback((r: "1d" | "30d") => write({ range: r }), [write]);
  const applyCustom = useCallback(
    (from: string, to: string): CustomRangeError | null => {
      const error = validateCustomRange(from, to, new Date());
      if (error) return error;
      write({ range: "custom", from, to });
      return null;
    },
    [write],
  );

  return { state, period, selectPreset, applyCustom };
}
