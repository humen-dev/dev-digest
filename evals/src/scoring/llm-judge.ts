/**
 * LLM Message Pattern judge. Binary PASS/FAIL per practice, PASS only with a verbatim evidence
 * quote. The judge defaults to a stronger family than the task to soften single-model
 * self-preference; the structural mitigations (blind + binary + verbatim) do the rest.
 *
 * Rubric v2 — what changed against v1 and why:
 *   - field order evidence → reason → passed: the judge finds the quote before it decides,
 *     instead of deciding first and picking a quote to fit;
 *   - `reason` on every result: a FAIL now says which part is missing (v1 FAILs often carried a
 *     quote that looked like a PASS and could not be debugged);
 *   - interpretation rules: meaning over wording, every part of a compound practice, "e.g." is an
 *     illustration, "OR" is any one — v1's "strict" alone made models match words literally;
 *   - the score is over the practices ASKED, not the results returned: an omitted practice is a
 *     FAIL, it no longer drops out of the denominator;
 *   - one retry on unparseable JSON — cheap models sometimes fence or truncate it.
 * Changing the rubric changes the measurement: repeat/delta series across v1 → v2 are not
 * comparable; take a new baseline.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runClaude } from "../runtime/run-claude.js";

const JUDGE_RUBRIC = `You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each practice independently.

Rules:
1. Exactly PASS or FAIL per practice, no scales.
2. PASS only when a verbatim quote from the OUTPUT shows the practice was met. A shared keyword is not evidence. Never invent or alter a quote.
3. Judge meaning, not wording: a paraphrase or synonym that states the same thing counts ("create a new migration" meets "goes into a new numbered migration" when nothing in the OUTPUT contradicts it).
4. A practice made of several required parts ("X and Y", "X; Y") passes only if EVERY part is met. Name the missing part in "reason".
5. Text after "e.g." or inside "(e.g. …)" is an illustration, not a requirement. "OR" / "at least one of" means any one alternative is enough.
6. A practice that forbids something ("does NOT …", "is not …") passes when the OUTPUT does not do it; quote the relevant part or write "" if the OUTPUT is silent on it.

For every practice, in the same order as listed, give:
- "evidence": the verbatim quote that best supports PASS, or "" if there is none;
- "reason": one sentence — for FAIL, what is missing or contradicted;
- "passed": true or false, decided AFTER the evidence and reason.

Reply with ONLY minified JSON, no markdown fences:
{"results":[{"practice":"<text>","evidence":"<verbatim quote>","reason":"<one sentence>","passed":true}]}`;

const RETRY_NOTE =
  "Your previous reply was not valid JSON in the required shape. Reply again with ONLY the minified JSON object, nothing else.";

export interface PracticeResult {
  practice: string;
  passed: boolean;
  evidence: string;
  reason?: string;
}

export interface Verdict {
  results: PracticeResult[];
  passed: number;
  total: number;
  score: number;
}

type RawResult = Partial<PracticeResult>;

/** Pull the results array out of a judge reply: tolerates fences and prose around the JSON.
 *  Returns null (never throws) when no usable JSON is found, so the caller can retry. */
export function parseVerdict(text: string): RawResult[] | null {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(unfenced.slice(start, end + 1));
    return Array.isArray(obj?.results) ? obj.results : null;
  } catch {
    return null;
  }
}

/**
 * Map the judge's results onto the practices that were ASKED, so the score's denominator is
 * always practices.length. Match by practice text first (the judge may reorder), then by
 * position; a practice with no result is a FAIL.
 */
export function alignVerdict(practices: string[], raw: RawResult[]): Verdict {
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const unused = new Set(raw.map((_, i) => i));
  const results = practices.map((practice, i): PracticeResult => {
    let idx = raw.findIndex((r, j) => unused.has(j) && norm(r.practice) === norm(practice));
    if (idx === -1 && unused.has(i)) idx = i;
    if (idx === -1) return { practice, passed: false, evidence: "", reason: "judge returned no result for this practice" };
    unused.delete(idx);
    const r = raw[idx];
    return { practice, passed: r.passed === true, evidence: String(r.evidence ?? ""), reason: r.reason ? String(r.reason) : undefined };
  });
  const passed = results.filter((r) => r.passed).length;
  const total = practices.length;
  return { results, passed, total, score: total ? passed / total : 1 };
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;

  let res = await runClaude(prompt, { allowedTools: [], maxTurns: 1, model });
  let raw = parseVerdict(res.text);
  if (!raw) {
    res = await runClaude(`${prompt}\n\n${RETRY_NOTE}`, { allowedTools: [], maxTurns: 1, model });
    raw = parseVerdict(res.text);
  }
  if (!raw) throw new Error(`judge returned no usable JSON after one retry: ${res.text.slice(0, 200)}`);
  return alignVerdict(practices, raw);
}
