/* ConventionCard — one candidate house rule: rule, category, evidence
   (file:line + snippet re-read from the file by the server), confidence and
   measured frequency, with Accept / Reject / inline Edit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, ProgressBar, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import type { ConventionPatch } from "@/lib/hooks/conventions";
import { CATEGORY_OPTIONS, COPIED_RESET_MS } from "../../constants";
import { confidenceColor, confidencePercent, evidenceLabel, evidenceRange } from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  /** `owner/name` — enables the GitHub deep-link on the evidence path. */
  repoFullName?: string | null;
  /** Commit the evidence was read at (scan head), else the default branch. */
  gitRef?: string | null;
  busy?: boolean;
  onPatch: (patch: ConventionPatch) => void;
}

export function ConventionCard({ candidate: c, repoFullName, gitRef, busy, onPatch }: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const accepted = c.status === "accepted";
  const rejected = c.status === "rejected";
  const pct = confidencePercent(c.confidence);
  const { start, end } = evidenceRange(c);

  const copy = () => {
    void navigator.clipboard?.writeText(c.evidence_snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <article style={s.card(accepted, rejected)} aria-label={c.rule}>
      <div style={s.main}>
        {editing ? (
          <InlineEditor
            candidate={c}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
              onPatch(patch);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div style={s.ruleRow}>
              <span style={s.rule}>{c.rule}</span>
              <span style={s.categoryTag}>{t(`card.category.${c.category}`)}</span>
            </div>
            {c.rationale && <div style={s.rationale}>{c.rationale}</div>}
          </>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead} className="mono">
            {repoFullName && gitRef ? (
              <a
                href={githubBlobUrl(repoFullName, gitRef, c.evidence_path, start, end)}
                target="_blank"
                rel="noreferrer"
                title={t("card.openOnGithub")}
                style={s.evidencePath}
              >
                {evidenceLabel(c)}
              </a>
            ) : (
              <span style={s.evidencePath}>{evidenceLabel(c)}</span>
            )}
            <button
              type="button"
              onClick={copy}
              title={copied ? t("card.copied") : t("card.copy")}
              aria-label={copied ? t("card.copied") : t("card.copy")}
              style={s.iconBtn}
            >
              {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
            </button>
          </div>
          <pre style={s.snippet} className="mono">
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.meta}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(pct)} height={5} />
          </div>
          <span className="mono tnum" style={s.pct}>
            {pct}%
          </span>
          {c.occurrences != null && (
            <span style={s.found}>{t("card.foundIn", { count: c.occurrences })}</span>
          )}
        </div>
      </div>

      <div style={s.actions}>
        {rejected ? (
          <Button kind="secondary" icon="History" full disabled={busy} onClick={() => onPatch({ status: "pending" })}>
            {t("card.undo")}
          </Button>
        ) : (
          <>
            <Button
              kind={accepted ? "primary" : "secondary"}
              icon="Check"
              full
              disabled={busy}
              aria-pressed={accepted}
              onClick={() => onPatch({ status: accepted ? "pending" : "accepted" })}
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button kind="ghost" icon="X" full disabled={busy} onClick={() => onPatch({ status: "rejected" })}>
              {t("card.reject")}
            </Button>
            <Button kind="ghost" icon="Edit" full disabled={busy || editing} onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function InlineEditor({
  candidate,
  busy,
  onSave,
  onCancel,
}: {
  candidate: ConventionCandidate;
  busy?: boolean;
  onSave: (patch: ConventionPatch) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("conventions");
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);
  const options = CATEGORY_OPTIONS.map((v) => ({ value: v, label: t(`card.category.${v}`) }));

  return (
    <div style={s.form}>
      <FormField label={t("card.fields.rule")} required>
        <TextInput value={rule} onChange={setRule} />
      </FormField>
      <FormField label={t("card.fields.rationale")}>
        <Textarea value={rationale} onChange={setRationale} rows={2} />
      </FormField>
      <FormField label={t("card.fields.category")}>
        <SelectInput value={category} onChange={(v) => setCategory(v as ConventionCategory)} options={options} />
      </FormField>
      <div style={s.formActions}>
        <Button kind="ghost" size="sm" onClick={onCancel}>
          {t("card.cancel")}
        </Button>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          disabled={busy || !rule.trim()}
          onClick={() => onSave({ rule: rule.trim(), rationale: rationale.trim() || null, category })}
        >
          {t("card.save")}
        </Button>
      </div>
    </div>
  );
}
