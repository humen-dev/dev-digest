import type { Finding, IntentForReview } from '@devdigest/shared';

/**
 * Deterministic out-of-scope filter (Decisions 5-6 of the intent-layer plan).
 *
 * Runs AFTER the citation-grounding gate, on grounded findings only, and only
 * when intent exists, its confidence is not `low`, and `out_of_scope_files` is
 * non-empty (the classifier already returns `[]` when it would cover every
 * changed file — `sanitizeOutOfScopeFiles`). A finding is out of scope iff its
 * `file` is in `intent.out_of_scope_files` (exact match against real changed
 * files — never a model-tagged per-finding scope).
 *
 * "Serious" (severity === 'CRITICAL' or category === 'security') out-of-scope
 * findings are never dropped: they collapse into exactly ONE aggregate finding
 * so the signal survives without spamming N near-duplicate "out of scope"
 * findings. Non-serious out-of-scope findings are dropped (and logged by the
 * caller). Severity is never lowered — the aggregate takes the highest
 * severity among the merged findings.
 */

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

export interface ScopeFilterDropped {
  finding: Finding;
  reason: 'out_of_scope';
}

export interface ScopeFilterSummary {
  applied: boolean;
  skippedReason: 'no_intent' | 'low_confidence' | 'no_out_of_scope_files' | null;
  /** Non-serious out-of-scope findings dropped. */
  filteredOut: number;
  /** Serious out-of-scope findings merged into the one aggregate signal. */
  aggregated: number;
}

export interface ScopeFilterResult {
  kept: Finding[];
  dropped: ScopeFilterDropped[];
  /** The serious out-of-scope findings that were merged into the aggregate (empty when none). */
  aggregatedFrom: Finding[];
  summary: ScopeFilterSummary;
}

function isSerious(finding: Finding): boolean {
  return finding.severity === 'CRITICAL' || finding.category === 'security';
}

function skip(findings: Finding[], reason: NonNullable<ScopeFilterSummary['skippedReason']>): ScopeFilterResult {
  return {
    kept: findings,
    dropped: [],
    aggregatedFrom: [],
    summary: { applied: false, skippedReason: reason, filteredOut: 0, aggregated: 0 },
  };
}

/** Pick the carrier (highest severity, then confidence) and merge the group into one Finding. */
function buildAggregate(group: Finding[]): Finding {
  const sorted = [...group].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
  );
  const carrier = sorted[0]!;
  const maxSeverity = sorted.reduce<Finding['severity']>(
    (max, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max] ? f.severity : max),
    carrier.severity,
  );
  const moreSuffix = group.length > 1 ? ` (+${group.length - 1} more)` : '';
  const mergedList = group
    .map((f) => `- ${f.file}:${f.start_line} — ${f.title} (${f.severity})`)
    .join('\n');

  return {
    ...carrier,
    id: `scope-aggregate:${carrier.id}`,
    severity: maxSeverity,
    title: `Outside PR scope: ${carrier.title}${moreSuffix}`,
    rationale:
      `${carrier.rationale}\n\n` +
      "Declared out of scope by the PR's stated intent, but kept because it is CRITICAL " +
      'severity or security-related. All merged out-of-scope findings:\n' +
      mergedList,
  };
}

export function applyScopeFilter(findings: Finding[], intent?: IntentForReview): ScopeFilterResult {
  if (!intent) return skip(findings, 'no_intent');
  if (intent.confidence === 'low') return skip(findings, 'low_confidence');
  if (intent.out_of_scope_files.length === 0) return skip(findings, 'no_out_of_scope_files');

  const outOfScopeFiles = new Set(intent.out_of_scope_files);
  const inScope: Finding[] = [];
  const outOfScope: Finding[] = [];
  for (const finding of findings) {
    (outOfScopeFiles.has(finding.file) ? outOfScope : inScope).push(finding);
  }

  const serious = outOfScope.filter(isSerious);
  const nonSerious = outOfScope.filter((f) => !isSerious(f));

  const dropped: ScopeFilterDropped[] = nonSerious.map((finding) => ({
    finding,
    reason: 'out_of_scope',
  }));
  const kept = serious.length > 0 ? [...inScope, buildAggregate(serious)] : inScope;

  return {
    kept,
    dropped,
    aggregatedFrom: serious,
    summary: {
      applied: true,
      skippedReason: null,
      filteredOut: dropped.length,
      aggregated: serious.length,
    },
  };
}
