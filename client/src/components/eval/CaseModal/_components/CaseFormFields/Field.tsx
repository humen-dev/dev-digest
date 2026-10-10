import React from "react";
import { s } from "./styles";

/** Wraps a control in a `<label>` so it gets an accessible name without ids.
 *  The `dd-shrink-input` class (globals.css) lets the vendored TextInput's inner <input> shrink to a narrow grid column. */
export function Field({ label, hidden, children }: { label: string; hidden?: boolean; children: React.ReactNode }) {
  return (
    <label className="dd-shrink-input" style={s.field}>
      <span style={hidden ? s.srOnly : s.label}>{label}</span>
      {children}
    </label>
  );
}
