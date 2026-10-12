"use client";

import { useEffect, useRef } from "react";
import { AUTO_REFRESH_MS } from "./constants";

/** Calls `onTick` every 30 s, but only while the tab is visible. */
export function useAutoRefresh(onTick: () => void, intervalMs: number = AUTO_REFRESH_MS) {
  const latest = useRef(onTick);
  latest.current = onTick;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") latest.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
