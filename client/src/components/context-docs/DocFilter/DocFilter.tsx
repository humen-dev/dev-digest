/* DocFilter — the path/folder filter box shared by both Context tabs. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function DocFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={s.search}>
      <Icon.Search size={13} style={s.icon} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={s.input}
      />
    </div>
  );
}
