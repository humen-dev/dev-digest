import type { BriefInput, BudgetResult } from '../types.js';
import { BUDGET_TOP_CALLERS, BUDGET_TOP_CHANGED_FILES, BUDGET_TOP_ENDPOINTS } from '../constants.js';

type Dropped = BudgetResult['dropped'];

/**
 * Fits a `BriefInput` into a token budget by dropping WHOLE items in the
 * AC-38 order, recording each `{kind, id}`; nothing is ever cut mid-text.
 * Order: callers beyond the top N → crons → endpoints beyond the top N →
 * changed files beyond the top N by churn → docs (lowest priority first) →
 * the issue body. Title, body, intent, totals and the blast summary are never
 * dropped; if still over budget, `fits` is false (the service refuses, AC-40).
 */
export function fitToBudget(input: BriefInput, count: (i: BriefInput) => number, budget: number): BudgetResult {
  let cur: BriefInput = {
    ...input,
    files: [...input.files],
    docs: [...input.docs],
    blast: input.blast
      ? { ...input.blast, callers: [...input.blast.callers], endpoints: [...input.blast.endpoints], crons: [...input.blast.crons] }
      : null,
    issue: input.issue ? { ...input.issue } : null,
  };
  const dropped: Dropped = [];
  let tokens = count(cur);
  const over = (): boolean => tokens > budget;
  const recount = (): void => {
    tokens = count(cur);
  };

  if (cur.blast) {
    // 1. callers beyond the top N (last first)
    while (over() && cur.blast.callers.length > BUDGET_TOP_CALLERS) {
      const c = cur.blast.callers.pop()!;
      dropped.push({ kind: 'blast_caller', id: `${c.file}:${c.line}` });
      recount();
    }
    // 2. crons (all of them, last first)
    while (over() && cur.blast.crons.length > 0) {
      dropped.push({ kind: 'cron', id: cur.blast.crons.pop()! });
      recount();
    }
    // 3. endpoints beyond the top N (last first)
    while (over() && cur.blast.endpoints.length > BUDGET_TOP_ENDPOINTS) {
      dropped.push({ kind: 'endpoint', id: cur.blast.endpoints.pop()! });
      recount();
    }
  }

  // 4. changed files beyond the top N by churn (lowest churn first)
  if (over() && cur.files.length > BUDGET_TOP_CHANGED_FILES) {
    const churn = (f: BriefInput['files'][number]): number => f.additions + f.deletions;
    const ranked = [...cur.files].sort((a, b) => churn(b) - churn(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const droppable = ranked.slice(BUDGET_TOP_CHANGED_FILES).reverse();
    const gone = new Set<string>();
    for (const f of droppable) {
      if (!over()) break;
      gone.add(f.path);
      dropped.push({ kind: 'changed_file', id: f.path });
      cur = { ...cur, files: cur.files.filter((x) => !gone.has(x.path)) };
      recount();
    }
  }

  // 5. docs from the lowest priority up
  while (over() && cur.docs.length > 0) {
    const d = cur.docs[cur.docs.length - 1]!;
    cur = { ...cur, docs: cur.docs.slice(0, -1) };
    dropped.push({ kind: 'context_doc', id: d.path });
    recount();
  }

  // 6. issue body
  if (over() && cur.issue && cur.issue.body !== '') {
    dropped.push({ kind: 'issue_body', id: String(cur.issue.number) });
    cur = { ...cur, issue: { ...cur.issue, body: '' } };
    recount();
  }

  return { input: cur, dropped, tokens, fits: !over() };
}
