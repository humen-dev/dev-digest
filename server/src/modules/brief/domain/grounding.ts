import type { Risk, ReviewFocusItem } from '@devdigest/shared';
import { MAX_FOCUS_ITEMS, MAX_RISKS, RISK_KINDS } from '../constants.js';
import type { BriefDraft, GroundingContext, GroundingResult, HunkRange } from '../types.js';
import { lineInRanges } from './hunks.js';

const REF_WITH_LINE = /^(?<path>.+):(?<a>\d+)(?:-(?<b>\d+))?$/;
const KINDS: readonly string[] = RISK_KINDS;

/** A usable path: relative, no `..` segment. Membership is then exact string equality. */
function isSafePath(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[\\/]/).includes('..');
}

function inKnown(p: string, set: ReadonlySet<string>): boolean {
  return isSafePath(p) && set.has(p);
}

/** Returns the grounded ref, or null when the path itself is invented. */
function groundRef(ref: string, ctx: GroundingContext): string | null {
  if (inKnown(ref, ctx.groundingSet)) return ref; // bare path (also covers paths containing ':')
  const m = REF_WITH_LINE.exec(ref);
  const path = m?.groups?.path;
  if (!m || path === undefined || !inKnown(path, ctx.groundingSet)) return null;
  if (!ctx.changedPaths.has(path)) return path; // blast-only file: keep the path, no hunks to check
  const ranges: readonly HunkRange[] = ctx.hunksByPath.get(path) ?? [];
  const a = Number(m.groups?.a);
  const b = m.groups?.b === undefined ? a : Number(m.groups.b);
  const ok = a > 0 && b >= a && ranges.some(([s, e]) => a >= s && b <= e);
  return ok ? ref : path;
}

export function groundBrief(draft: BriefDraft, ctx: GroundingContext): GroundingResult {
  const drops = { refs: 0, risks: 0, focus: 0 };

  const risks: Risk[] = [];
  for (const r of draft.risks) {
    const refs: string[] = [];
    for (const raw of r.file_refs) {
      const g = groundRef(raw, ctx);
      if (g === null) drops.refs += 1;
      else refs.push(g);
    }
    if (refs.length === 0) {
      drops.risks += 1;
      continue;
    }
    risks.push({
      kind: KINDS.includes(r.kind) ? r.kind : 'other',
      title: r.title,
      explanation: r.explanation,
      severity: r.severity,
      file_refs: refs,
    });
  }

  const focus: ReviewFocusItem[] = [];
  for (const f of draft.review_focus) {
    if (!inKnown(f.file, ctx.changedPaths)) {
      drops.focus += 1;
      continue;
    }
    const ranges = ctx.hunksByPath.get(f.file) ?? [];
    const line = f.line !== null && f.line > 0 && lineInRanges(f.line, ranges) ? f.line : null;
    focus.push({ file: f.file, line, reason: f.reason });
  }

  return {
    brief: {
      summary: draft.summary,
      risks: risks.slice(0, MAX_RISKS),
      review_focus: focus.slice(0, MAX_FOCUS_ITEMS),
    },
    drops,
  };
}
