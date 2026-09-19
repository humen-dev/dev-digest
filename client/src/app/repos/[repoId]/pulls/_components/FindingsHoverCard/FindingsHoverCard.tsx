/* FindingsHoverCard — hover/focus popover rendered in a PORTAL. Used by the PR
   list FINDINGS cell and the Agent-runs timeline row. It must portal to
   document.body: the PR-list table card has `overflow:hidden`, which would clip
   an absolutely-positioned child (esp. the last row). Fixed positioning from the
   trigger's rect + a computed max-height keep it on-screen without a flip. */
"use client";

import React from "react";
import { createPortal } from "react-dom";

const CLOSE_DELAY_MS = 120;

export function FindingsHoverCard({
  children,
  panel,
  width = 360,
  disabled = false,
}: {
  /** The always-visible trigger content. */
  children: React.ReactNode;
  /** The popover body (rendered only while open). */
  panel: React.ReactNode;
  width?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<number | null>(null);

  const clearClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const show = () => {
    if (disabled) return;
    clearClose();
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
      const top = r.bottom + 6;
      setPos({ top, left, maxHeight: Math.max(160, window.innerHeight - top - 12) });
    }
    setOpen(true);
  };

  const hide = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  React.useEffect(() => () => clearClose(), []);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={disabled ? undefined : 0}
      style={{ display: "inline-flex", alignItems: "center", outline: "none" }}
    >
      {children}
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: pos.maxHeight,
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 10,
              zIndex: 60,
              animation: "ddpop .12s ease",
            }}
          >
            {panel}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default FindingsHoverCard;
