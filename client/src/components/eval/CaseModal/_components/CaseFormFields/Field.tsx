import React from "react";
import { s } from "./styles";

/** Wraps a control in a `<label>` so it gets an accessible name without ids. */
export function Field({ label, hidden, children }: { label: string; hidden?: boolean; children: React.ReactNode }) {
  return (
    <label style={s.field}>
      <span style={hidden ? s.srOnly : s.label}>{label}</span>
      {children}
    </label>
  );
}
