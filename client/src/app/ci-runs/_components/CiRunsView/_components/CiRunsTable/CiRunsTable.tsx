"use client";

import { useTranslations } from "next-intl";
import { Badge, SeverityBadge } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/eval-format";
import { relativeTime } from "@/lib/relative-time";
import { STATUS_LABEL_KEY } from "../../constants";
import { safeGithubUrl } from "../../helpers";
import { s } from "../../styles";
import { STATUS_STYLE } from "./constants";

const COLUMNS = [
  "timestamp",
  "repo",
  "pullRequest",
  "agent",
  "verdict",
  "findings",
  "cost",
  "duration",
  "status",
  "links",
] as const;

/** All run fields are rendered as React text children — never as HTML. */
export function CiRunsTable({ runs, onOpenTrace }: { runs: CiRun[]; onOpenTrace: (agentRunId: string) => void }) {
  const t = useTranslations("ci");

  return (
    <div style={s.tableCard}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`runs.table.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <CiRunRow key={run.id} run={run} onOpenTrace={onOpenTrace} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CiRunRow({ run, onOpenTrace }: { run: CiRun; onOpenTrace: (agentRunId: string) => void }) {
  const t = useTranslations("ci");
  const prUrl = safeGithubUrl(run.pr_url);
  const jobUrl = safeGithubUrl(run.job_url);
  const statusStyle = STATUS_STYLE[run.status];
  const severities = [
    ["CRITICAL", run.critical],
    ["WARNING", run.warning],
    ["SUGGESTION", run.suggestion],
  ] as const;
  const shownSeverities = severities.filter(([, n]) => (n ?? 0) > 0);

  const prNumber = run.pr_number != null ? `#${run.pr_number}` : null;
  const prTitle = run.pr_title ?? "";
  const prContent = (
    <>
      {prNumber && (
        <span className="mono" style={s.prNumber}>
          {prNumber}
        </span>
      )}
      <span style={s.prTitle} title={prTitle || undefined}>
        {prTitle}
      </span>
    </>
  );

  return (
    <tr>
      <td style={s.td}>
        <time dateTime={run.ran_at} title={run.ran_at}>
          {relativeTime(run.ran_at)}
        </time>
      </td>
      <td style={s.td}>
        <span className="mono">{run.repo}</span>
      </td>
      <td style={s.td}>
        {prNumber || prTitle ? (
          prUrl ? (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.prCell, color: "inherit" }}>
              {prContent}
            </a>
          ) : (
            <div style={s.prCell}>{prContent}</div>
          )
        ) : (
          "—"
        )}
      </td>
      <td style={s.td}>{run.agent_name ?? "—"}</td>
      <td style={s.td}>{run.verdict ? t(`runs.verdict.${run.verdict}`) : "—"}</td>
      <td style={s.td}>
        {shownSeverities.length > 0 ? (
          <div style={s.findings}>
            {shownSeverities.map(([sev, n]) => (
              <SeverityBadge key={sev} severity={sev} count={n ?? 0} />
            ))}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td style={s.td}>
        <span className="mono tnum">{formatCost(run.cost_usd)}</span>
      </td>
      <td style={s.td}>
        <span className="tnum">{run.duration_ms != null ? formatDurationMs(run.duration_ms) : "—"}</span>
      </td>
      <td style={s.td}>
        <div style={s.statusCell}>
          <Badge color={statusStyle.color} bg={statusStyle.bg} dot>
            {t(`runs.status.${STATUS_LABEL_KEY[run.status]}`)}
          </Badge>
          {run.status === "failed" && run.failure_reason && (
            <span style={s.failure}>{t("runs.failureReason", { reason: run.failure_reason })}</span>
          )}
        </div>
      </td>
      <td style={s.td}>
        <div style={s.links}>
          {jobUrl && (
            <a href={jobUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("runs.job")}
            </a>
          )}
          {run.agent_run_id && (
            <button type="button" style={s.linkButton} onClick={() => onOpenTrace(run.agent_run_id as string)}>
              {t("runs.trace")}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
