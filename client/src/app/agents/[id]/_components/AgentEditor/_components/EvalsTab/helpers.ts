import type {
  EvalCaseDetail,
  EvalCaseInput,
  EvalCasePatch,
  EvalExpectation,
  EvalRunRecord,
} from "@devdigest/shared";
import { CASE_ERROR_CODES } from "./constants";
import type { CaseDraft } from "./types";

export const EMPTY_DRAFT: CaseDraft = {
  name: "",
  notes: "",
  diff: "",
  prTitle: "",
  prBody: "",
  type: "must_find",
  file: "",
  startLine: "",
  endLine: "",
};

export function draftFromCase(c: EvalCaseDetail): CaseDraft {
  return {
    name: c.name,
    notes: c.notes ?? "",
    diff: c.input_diff,
    prTitle: c.input_meta.title,
    prBody: c.input_meta.body ?? "",
    type: c.expectation.type,
    file: c.expectation.file,
    startLine: String(c.expectation.start_line),
    endLine: String(c.expectation.end_line),
  };
}

/** "12" → 12; anything that is not an integer >= 1 → null. */
export function parseLine(raw: string): number | null {
  const v = raw.trim();
  return /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : null;
}

export function expectationFromDraft(d: CaseDraft): EvalExpectation | null {
  const start = parseLine(d.startLine);
  const end = parseLine(d.endLine);
  const file = d.file.trim();
  if (!file || start == null || end == null || start > end) return null;
  return { type: d.type, file, start_line: start, end_line: end };
}

/** Save/create stays disabled until the draft would pass the closed contracts. */
export function isDraftValid(d: CaseDraft): boolean {
  return (
    d.name.trim().length > 0 &&
    d.name.trim().length <= 120 &&
    d.notes.length <= 2000 &&
    d.diff.trim().length > 0 &&
    expectationFromDraft(d) != null
  );
}

export function draftToInput(d: CaseDraft): EvalCaseInput | null {
  const expectation = expectationFromDraft(d);
  if (!expectation) return null;
  return {
    name: d.name.trim(),
    notes: d.notes.trim() ? d.notes : null,
    input_diff: d.diff,
    pr_title: d.prTitle,
    pr_body: d.prBody ? d.prBody : null,
    expectation,
  };
}

/** Only the fields that differ from the stored case; null when nothing changed or the draft is invalid. */
export function draftToPatch(d: CaseDraft, c: EvalCaseDetail): EvalCasePatch | null {
  const expectation = expectationFromDraft(d);
  if (!expectation) return null;
  const patch: EvalCasePatch = {};
  if (d.name.trim() !== c.name) patch.name = d.name.trim();
  if ((d.notes.trim() ? d.notes : null) !== c.notes) patch.notes = d.notes.trim() ? d.notes : null;
  if (d.diff !== c.input_diff) patch.input_diff = d.diff;
  if (d.prTitle !== c.input_meta.title) patch.pr_title = d.prTitle;
  if ((d.prBody ? d.prBody : null) !== c.input_meta.body) patch.pr_body = d.prBody ? d.prBody : null;
  const e = c.expectation;
  if (
    expectation.type !== e.type ||
    expectation.file !== e.file ||
    expectation.start_line !== e.start_line ||
    expectation.end_line !== e.end_line
  ) {
    patch.expectation = expectation;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Maps an ApiError code to an `eval.errors.*` key; unknown codes fall back to `generic`. */
export function caseErrorKey(code: string | null | undefined): string {
  return (CASE_ERROR_CODES as readonly string[]).includes(code ?? "") ? (code as string) : "generic";
}

/** ICU values the `eval.errors.*` messages may reference. */
export function caseErrorValues(details: unknown, d?: CaseDraft) {
  const x = (details ?? {}) as Record<string, unknown>;
  return {
    provider: typeof x.provider === "string" ? x.provider : "",
    count: typeof x.count === "number" ? x.count : 0,
    file: d?.file ?? "",
    start: d?.startLine ?? "",
    end: d?.endLine ?? "",
  };
}

/** Per-metric change of the latest run against the previous one (0..1 ratios); null when either side is missing. */
export function metricDeltas(latest: EvalRunRecord | null, previous: EvalRunRecord | null) {
  const a = latest?.metrics;
  const b = previous?.metrics;
  if (!a || !b) return undefined;
  const diff = (x: number | null, y: number | null) => (x == null || y == null ? null : x - y);
  return {
    recall: diff(a.recall, b.recall),
    precision: diff(a.precision, b.precision),
    citation_accuracy: diff(a.citation_accuracy, b.citation_accuracy),
  };
}
