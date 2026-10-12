import React from "react";
import { s } from "./styles";

/** Numbered step title ("1 Pull request") with an optional right-side action. */
export function StepHeader({
  n,
  active,
  children,
  action,
}: {
  n: number;
  active: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={s.row}>
      <span style={{ ...s.badge, ...(active ? s.badgeOn : s.badgeOff) }}>{n}</span>
      <span style={{ ...s.title, color: active ? "var(--text-primary)" : "var(--text-muted)" }}>{children}</span>
      {action}
    </div>
  );
}
