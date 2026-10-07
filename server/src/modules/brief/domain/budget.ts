import type { BriefInput, BudgetResult } from '../types.js';
import { BUDGET_TOP_CALLERS, BUDGET_TOP_CHANGED_FILES, BUDGET_TOP_ENDPOINTS } from '../constants.js';

type Dropped = BudgetResult['dropped'];
type Item = Dropped[number];

/**
 * One drop phase: `items` are the droppable entries in drop order and
 * `without(k)` is the input with the first `k` of them removed.
 */
interface Phase {
  items: Item[];
  without: (k: number) => BriefInput;
}

/**
 * Fits a `BriefInput` into a token budget by dropping WHOLE items in the
 * AC-38 order, recording each `{kind, id}`; nothing is ever cut mid-text.
 * Order: callers beyond the top N → crons → endpoints beyond the top N →
 * changed files beyond the top N by churn → docs (lowest priority first) →
 * the issue body. Title, body, intent, totals and the blast summary are never
 * dropped; if still over budget, `fits` is false (the service refuses, AC-40).
 *
 * Within a phase the smallest number of drops that fits is found by binary
 * search (dropping more never adds tokens), so a huge PR costs O(log N)
 * prompt renders per phase instead of one per dropped item. The outcome is
 * identical to dropping one item at a time.
 */
export function fitToBudget(input: BriefInput, count: (i: BriefInput) => number, budget: number): BudgetResult {
  let cur: BriefInput = input;
  let tokens = count(cur);
  const dropped: Dropped = [];

  const run = (phase: Phase): void => {
    const n = phase.items.length;
    if (tokens <= budget || n === 0) return;
    // Smallest k in [1, n] whose result fits; n when nothing in the phase is enough.
    let lo = 1;
    let hi = n;
    let best: { k: number; tokens: number } | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = count(phase.without(mid));
      if (t <= budget) {
        best = { k: mid, tokens: t };
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const k = best ? best.k : n;
    cur = phase.without(k);
    tokens = best ? best.tokens : count(cur);
    dropped.push(...phase.items.slice(0, k));
  };

  const blast = (): NonNullable<BriefInput['blast']> => cur.blast!;

  if (cur.blast) {
    // 1. callers beyond the top N (last first)
    {
      const keep = blast().callers.slice(0, BUDGET_TOP_CALLERS);
      const extra = blast().callers.slice(BUDGET_TOP_CALLERS).reverse();
      const base = cur;
      run({
        items: extra.map((c) => ({ kind: 'blast_caller', id: `${c.file}:${c.line}` })),
        without: (k) => ({ ...base, blast: { ...base.blast!, callers: [...keep, ...extra.slice(k).reverse()] } }),
      });
    }
    // 2. crons (all of them, last first)
    {
      const crons = blast().crons;
      const base = cur;
      run({
        items: [...crons].reverse().map((c) => ({ kind: 'cron', id: c })),
        without: (k) => ({ ...base, blast: { ...base.blast!, crons: crons.slice(0, crons.length - k) } }),
      });
    }
    // 3. endpoints beyond the top N (last first)
    {
      const keep = blast().endpoints.slice(0, BUDGET_TOP_ENDPOINTS);
      const extra = blast().endpoints.slice(BUDGET_TOP_ENDPOINTS).reverse();
      const base = cur;
      run({
        items: extra.map((e) => ({ kind: 'endpoint', id: e })),
        without: (k) => ({ ...base, blast: { ...base.blast!, endpoints: [...keep, ...extra.slice(k).reverse()] } }),
      });
    }
  }

  // 4. changed files beyond the top N by churn (lowest churn first)
  if (cur.files.length > BUDGET_TOP_CHANGED_FILES) {
    const churn = (f: BriefInput['files'][number]): number => f.additions + f.deletions;
    const ranked = [...cur.files].sort((a, b) => churn(b) - churn(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const droppable = ranked.slice(BUDGET_TOP_CHANGED_FILES).reverse();
    const base = cur;
    run({
      items: droppable.map((f) => ({ kind: 'changed_file', id: f.path })),
      without: (k) => {
        const gone = new Set(droppable.slice(0, k).map((f) => f.path));
        return { ...base, files: base.files.filter((f) => !gone.has(f.path)) };
      },
    });
  }

  // 5. docs from the lowest priority up
  {
    const docs = cur.docs;
    const base = cur;
    run({
      items: [...docs].reverse().map((d) => ({ kind: 'context_doc', id: d.path })),
      without: (k) => ({ ...base, docs: docs.slice(0, docs.length - k) }),
    });
  }

  // 6. issue body
  if (cur.issue && cur.issue.body !== '') {
    const base = cur;
    const issue = cur.issue;
    run({
      items: [{ kind: 'issue_body', id: String(issue.number) }],
      without: () => ({ ...base, issue: { ...issue, body: '' } }),
    });
  }

  return { input: cur, dropped, tokens, fits: tokens <= budget };
}
