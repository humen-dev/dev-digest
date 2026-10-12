"use client";

import React from "react";
import { FOCUSABLE_SELECTOR } from "./constants";

/**
 * NFR-9 / NFR-12 — keeps Tab / Shift+Tab inside `ref`, calls `onEscape` on Escape, moves focus
 * into the container on mount and gives it back to the opener on unmount.
 * Returns the `onKeyDown` handler (Tab cycling) to put on the container; Escape is listened for on
 * the document so it still works after a step change drops the focused element.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, onEscape: () => void) {
  const escapeRef = React.useRef(onEscape);
  React.useEffect(() => {
    escapeRef.current = onEscape;
  });

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const container = ref.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? container)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") escapeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [ref]);

  return (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (items.length === 0) return;
    const firstEl = items[0]!;
    const lastEl = items[items.length - 1]!;
    const active = document.activeElement;
    const outside = !ref.current.contains(active);
    if (e.shiftKey && (active === firstEl || outside)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && (active === lastEl || outside)) {
      e.preventDefault();
      firstEl.focus();
    }
  };
}
