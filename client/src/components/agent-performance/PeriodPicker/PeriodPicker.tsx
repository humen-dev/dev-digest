"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { customRangeLabel, toLocalDateString, type CustomRangeError, type PerfPeriodState } from "@/lib/perf-period";
import { s } from "./styles";

/**
 * 1 day / 30 days / Custom range. Presets apply immediately; a custom range is
 * validated by `onApplyCustom` (returns an error kind, shown inline, or null).
 */
export function PeriodPicker({
  state,
  onPreset,
  onApplyCustom,
}: {
  state: PerfPeriodState;
  onPreset: (r: "1d" | "30d") => void;
  onApplyCustom: (from: string, to: string) => CustomRangeError | null;
}) {
  const t = useTranslations("agentPerformance");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(state.from ?? "");
  const [to, setTo] = useState(state.to ?? "");
  const [error, setError] = useState<CustomRangeError | null>(null);
  const showCustom = open || state.range === "custom";
  const today = toLocalDateString(new Date());

  const apply = () => {
    const err = onApplyCustom(from, to);
    setError(err);
    if (!err) setOpen(false);
  };

  return (
    <div style={s.wrap}>
      <div style={s.group} role="group" aria-label={t("title")}>
        <Button
          size="sm"
          kind="tertiary"
          active={state.range === "1d"}
          aria-pressed={state.range === "1d"}
          onClick={() => {
            setOpen(false);
            setError(null);
            onPreset("1d");
          }}
        >
          {t("period.oneDay")}
        </Button>
        <Button
          size="sm"
          kind="tertiary"
          active={state.range === "30d"}
          aria-pressed={state.range === "30d"}
          onClick={() => {
            setOpen(false);
            setError(null);
            onPreset("30d");
          }}
        >
          {t("period.thirtyDays")}
        </Button>
        <Button
          size="sm"
          kind="tertiary"
          active={state.range === "custom" || open}
          aria-pressed={state.range === "custom"}
          aria-expanded={showCustom}
          onClick={() => setOpen((v) => !v)}
        >
          {t("period.custom")}
        </Button>
      </div>
      {state.range === "custom" && state.from && state.to && (
        <span className="tnum" style={s.label}>
          {customRangeLabel(state.from, state.to, locale, new Date())}
        </span>
      )}
      {showCustom && (
        <div style={s.custom}>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("period.from")}</span>
            <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} style={s.input} />
          </label>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("period.to")}</span>
            <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} style={s.input} />
          </label>
          <Button size="sm" kind="secondary" onClick={apply}>
            {t("period.apply")}
          </Button>
        </div>
      )}
      {error && (
        <div role="alert" style={s.error}>
          {t(`period.errors.${error}`)}
        </div>
      )}
    </div>
  );
}
