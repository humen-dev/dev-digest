"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = "input, textarea, select, button, [href], [tabindex]:not([tabindex='-1'])";

/** Keyboard operability for the vendored Modal (NFR-9), which has no Escape or focus handling:
 *  Escape closes, focus moves into the dialog on open and returns to the opener on close.
 *  Attach the returned ref to an element rendered inside the Modal's children. */
export function useDialogKeyboard(onClose: () => void) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const target =
      bodyRef.current?.querySelector<HTMLElement>("input, textarea, select") ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  return bodyRef;
}
