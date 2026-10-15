"use client";

import React from "react";
import { Skeleton } from "@devdigest/ui";
import { s } from "./styles";

/**
 * A dashboard / Stats KPI tile. While `loading` it shows skeleton bars only —
 * never digits — so a stale or zero value cannot be mistaken for data.
 */
export function KpiCard({
  label,
  loading,
  value,
  footer,
  aside,
}: {
  label: string;
  loading: boolean;
  value: React.ReactNode;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div style={s.card} data-testid="kpi-card">
      <span style={s.label}>{label}</span>
      {loading ? (
        <div style={s.skeleton} aria-busy="true">
          <Skeleton width={96} height={28} />
          <Skeleton width={140} height={12} style={{ marginTop: 8 }} />
        </div>
      ) : (
        <>
          <div style={s.valueRow}>
            <span className="tnum" style={s.value}>
              {value}
            </span>
            {aside}
          </div>
          {footer != null && <div style={s.footer}>{footer}</div>}
        </>
      )}
    </div>
  );
}
