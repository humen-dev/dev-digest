import type {
  EvalCaseOutcome,
  EvalCompare,
  EvalRunDetail,
  EvalRunRecord,
  EvalSkillRef,
} from '@devdigest/shared';
import { EVAL_PROMPT_DIFF_MAX_CELLS } from '../constants.js';
import { runCost, scoreRun } from './scoring.js';

type PromptDiffLine = { op: 'add' | 'remove' | 'same'; text: string };

/** Line-based LCS diff. Common prefix/suffix are trimmed first to keep the table small. */
export function promptLineDiff(a: string, b: string): PromptDiffLine[] {
  const x = a.split('\n');
  const y = b.split('\n');
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const mx = x.slice(start, endX);
  const my = y.slice(start, endY);
  const n = mx.length;
  const m = my.length;

  // Too large for the LCS table: coarse, deterministic diff of the differing middle.
  if ((n + 1) * (m + 1) > EVAL_PROMPT_DIFF_MAX_CELLS) {
    return [
      ...x.slice(0, start).map((text): PromptDiffLine => ({ op: 'same', text })),
      ...mx.map((text): PromptDiffLine => ({ op: 'remove', text })),
      ...my.map((text): PromptDiffLine => ({ op: 'add', text })),
      ...x.slice(endX).map((text): PromptDiffLine => ({ op: 'same', text })),
    ];
  }

  // lcs[i][j] = LCS length of mx[i..] and my[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = mx[i] === my[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: PromptDiffLine[] = x.slice(0, start).map((text) => ({ op: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && mx[i] === my[j]) {
      out.push({ op: 'same', text: mx[i]! });
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      out.push({ op: 'remove', text: mx[i]! });
      i++;
    } else {
      out.push({ op: 'add', text: my[j]! });
      j++;
    }
  }
  for (const text of x.slice(endX)) out.push({ op: 'same', text });
  return out;
}

/** Skills added, removed or moved to another version between two fingerprints. */
export function skillsDiff(a: readonly EvalSkillRef[], b: readonly EvalSkillRef[]): EvalCompare['skills_diff'] {
  const before = new Map(a.map((s) => [s.skill_id, s]));
  const after = new Map(b.map((s) => [s.skill_id, s]));
  const out: EvalCompare['skills_diff'] = [];
  for (const [id, s] of after) {
    const old = before.get(id);
    if (!old) out.push({ skill_id: id, name: s.name, change: 'added', from_version: null, to_version: s.version });
    else if (old.version !== s.version)
      out.push({ skill_id: id, name: s.name, change: 'changed', from_version: old.version, to_version: s.version });
  }
  for (const [id, s] of before) {
    if (!after.has(id))
      out.push({ skill_id: id, name: s.name, change: 'removed', from_version: s.version, to_version: null });
  }
  return out.sort((p, q) => p.name.localeCompare(q.name) || p.skill_id.localeCompare(q.skill_id));
}

const fingerprintKey = (f: readonly EvalSkillRef[]): string =>
  f
    .map((s) => `${s.skill_id}@${s.version}`)
    .sort()
    .join('|');

/**
 * Sets `skills_delta` on each run whose fingerprint differs from the nearest
 * earlier completed run of the same agent version. Input is newest first.
 */
export function markSkillsDelta(runsNewestFirst: readonly EvalRunRecord[]): EvalRunRecord[] {
  return runsNewestFirst.map((run, idx) => {
    const earlier = runsNewestFirst
      .slice(idx + 1)
      .find((r) => r.status === 'completed' && r.agent_version === run.agent_version);
    const changed = earlier ? fingerprintKey(earlier.skills_fingerprint) !== fingerprintKey(run.skills_fingerprint) : false;
    return { ...run, skills_delta: changed };
  });
}

const delta = (older: number | null, newer: number | null) => ({
  older,
  newer,
  delta: older == null || newer == null ? null : newer - older,
});

/** All deltas, cost included, are recomputed over the cases common to both runs (I-7). */
export function compareRuns(
  older: EvalRunDetail,
  newer: EvalRunDetail,
  prompts: { older: string | null; newer: string | null },
): EvalCompare {
  const olderIds = new Set(older.case_ids);
  const newerIds = new Set(newer.case_ids);
  const common = newer.case_ids.filter((id) => olderIds.has(id));
  const commonSet = new Set(common);

  const nameOf = (run: EvalRunDetail, id: string): string => run.per_case.find((o) => o.case_id === id)?.name ?? id;
  const restrict = (run: EvalRunDetail): EvalCaseOutcome[] => run.per_case.filter((o) => commonSet.has(o.case_id));

  const olderOutcomes = restrict(older);
  const newerOutcomes = restrict(newer);
  const mo = scoreRun(olderOutcomes);
  const mn = scoreRun(newerOutcomes);

  const missing = [
    ...(prompts.older == null ? [older.agent_version] : []),
    ...(prompts.newer == null ? [newer.agent_version] : []),
  ];

  const { per_case: _o, ...olderRecord } = older;
  const { per_case: _n, ...newerRecord } = newer;

  return {
    older: olderRecord,
    newer: newerRecord,
    common_case_ids: common,
    only_in_older: older.case_ids
      .filter((id) => !newerIds.has(id))
      .map((id) => ({ case_id: id, name: nameOf(older, id) })),
    only_in_newer: newer.case_ids
      .filter((id) => !olderIds.has(id))
      .map((id) => ({ case_id: id, name: nameOf(newer, id) })),
    metrics: {
      recall: delta(mo.recall, mn.recall),
      precision: delta(mo.precision, mn.precision),
      citation_accuracy: delta(mo.citation_accuracy, mn.citation_accuracy),
      cost_usd: delta(runCost(olderOutcomes), runCost(newerOutcomes)),
    },
    prompt_diff: prompts.older == null || prompts.newer == null ? null : promptLineDiff(prompts.older, prompts.newer),
    missing_snapshot_versions: [...new Set(missing)].sort((p, q) => p - q),
    skills_diff: skillsDiff(older.skills_fingerprint, newer.skills_fingerprint),
  };
}
