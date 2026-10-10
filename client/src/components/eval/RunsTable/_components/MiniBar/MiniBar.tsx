import React from "react";

/** Thin horizontal bar + percent for a 0..1 ratio; `null` renders the n/a label, no bar fill. */
export function MiniBar({
  value,
  color,
  notApplicable,
}: {
  value: number | null;
  color: string;
  notApplicable: string;
}) {
  const pct = value == null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div
        aria-hidden="true"
        style={{ flex: 1, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" }}
      >
        <div style={{ width: `${pct ?? 0}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span
        className="mono tnum"
        style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 30, textAlign: "right" }}
      >
        {pct == null ? notApplicable : `${pct}%`}
      </span>
    </div>
  );
}
