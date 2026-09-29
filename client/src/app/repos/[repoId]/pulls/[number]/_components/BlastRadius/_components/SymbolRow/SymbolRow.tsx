"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { callerHref } from "../../helpers";
import { s } from "./styles";

type Downstream = BlastRadiusResponse["downstream"][number];

interface SymbolRowProps {
  group: Downstream;
  defaultExpanded: boolean;
  repoFullName: string | null;
  headSha: string | null;
}

export function SymbolRow({ group, defaultExpanded, repoFullName, headSha }: SymbolRowProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(defaultExpanded);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.row}>
      <button
        type="button"
        style={s.toggle}
        aria-expanded={open}
        aria-label={`${open ? t("toggle.collapse") : t("toggle.expand")}: ${group.symbol}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron size={14} />
        <span className="mono" style={s.name}>
          {group.symbol}
        </span>
        <span style={s.count}>{t("callerCount", { count: group.callers.length })}</span>
      </button>

      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {group.callers.map((c) => {
              const href = callerHref(repoFullName, headSha, c);
              const label = `↳ ${c.file}:${c.line}`;
              return (
                <li key={`${c.file}|${c.name}|${c.line}`} className="mono" style={s.caller}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.callerLink}
                      aria-label={`${c.name}: ${t("callerLink", { file: c.file, line: c.line })}`}
                    >
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>

          {group.endpoints_affected.length > 0 && (
            <div style={s.chipGroup} role="list" aria-label={t("endpointsLabel")}>
              {group.endpoints_affected.map((e) => (
                <span key={e} role="listitem" className="mono" style={s.endpointChip}>
                  <Icon.Globe size={12} />
                  {e}
                </span>
              ))}
            </div>
          )}
          {group.crons_affected.length > 0 && (
            <div style={s.chipGroup} role="list" aria-label={t("cronsLabel")}>
              {group.crons_affected.map((c) => (
                <span key={c} role="listitem" className="mono" style={s.cronChip}>
                  <Icon.Clock size={12} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
