import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalCase, LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { EVAL_CASE_DEADLINE_MS, EVAL_CASE_REASON, EVAL_MAX_REPAIR_RETRIES, EVAL_TASK_LINE } from './constants.js';
import type { AgentSnapshot, DiffParser } from './ports.js';
import type { CaseExecution } from './domain/scoring.js';

export type { CaseExecution } from './domain/scoring.js';

/** A case ended without a score; `reason` is stored as the outcome's `error_reason`. */
export class EvalCaseError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'EvalCaseError';
  }
}

export interface RunCaseInput {
  snapshot: AgentSnapshot;
  /** Already rendered skill blocks (enabled, not injection-flagged). */
  skillBlocks: string[];
  evalCase: EvalCase;
  llm: LLMProvider;
  parser: DiffParser;
  now?: () => number;
}

/** Wraps the provider so every structured call gets the remaining budget and a capped retry count. */
function withDeadline(llm: LLMProvider, deadline: number, now: () => number): LLMProvider {
  return {
    get id() {
      return llm.id;
    },
    listModels: () => llm.listModels(),
    complete: (req) => llm.complete(req),
    embed: (texts) => llm.embed(texts),
    completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const remaining = deadline - now();
      if (remaining <= 0) return Promise.reject(new EvalCaseError('timeout'));
      return llm.completeStructured<T>({
        ...req,
        timeoutMs: Math.min(req.timeoutMs ?? remaining, remaining),
        maxRetries: Math.min(req.maxRetries ?? EVAL_MAX_REPAIR_RETRIES, EVAL_MAX_REPAIR_RETRIES),
      });
    },
  };
}

/**
 * Maps any thrown value to one fixed reason code. The raw message is never kept:
 * it is only inspected here to tell a schema failure from a transport failure.
 */
function reasonOf(err: unknown): string {
  if (err instanceof EvalCaseError) return err.reason;
  if (!(err instanceof Error)) return EVAL_CASE_REASON.error;
  if (/Timeout|^AbortError$/i.test(err.name)) return EVAL_CASE_REASON.timeout;
  if (err.name === 'ZodError' || /schema validation/i.test(err.message)) return EVAL_CASE_REASON.invalidOutput;
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown };
  if (
    err.name === 'ExternalServiceError' ||
    e.code === 'external_service_error' ||
    typeof e.status === 'number' ||
    typeof e.statusCode === 'number' ||
    /APIError|APIConnection/i.test(err.name)
  ) {
    return EVAL_CASE_REASON.providerError;
  }
  return EVAL_CASE_REASON.error;
}

/**
 * Runs one frozen case through the real review engine: system prompt + skills +
 * the frozen diff only (no repo map / callers / context / intent / memory).
 * The 120 s deadline (I-1) is enforced here, not in reviewer-core.
 */
export async function runCase(input: RunCaseInput): Promise<CaseExecution> {
  const now = input.now ?? Date.now;
  const started = now();
  const deadline = started + EVAL_CASE_DEADLINE_MS;
  const { snapshot, evalCase } = input;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EvalCaseError('timeout')), EVAL_CASE_DEADLINE_MS);
  });
  timeout.catch(() => undefined);

  try {
    const diff = input.parser.parse(evalCase.input_diff);
    const { title, body } = evalCase.input_meta;
    // I-3: PR text only ever goes into the untrusted prDescription slot.
    const prDescription = body ? `${title}\n\n${body}` : title;

    const work = reviewPullRequest({
      systemPrompt: snapshot.system_prompt,
      model: snapshot.model,
      diff,
      llm: withDeadline(input.llm, deadline, now),
      ...(snapshot.strategy ? { strategy: snapshot.strategy } : {}),
      ...(input.skillBlocks.length > 0 ? { skills: input.skillBlocks } : {}),
      ...(prDescription ? { prDescription } : {}),
      task: EVAL_TASK_LINE,
      maxRetries: EVAL_MAX_REPAIR_RETRIES,
      checkCancelled: () => {
        if (now() >= deadline) throw new EvalCaseError('timeout');
      },
    });
    // An abandoned request may still settle later; its result and cost are discarded.
    work.catch(() => undefined);

    const outcome = await Promise.race([work, timeout]);
    const kept = outcome.review.findings.length;
    return {
      findings: outcome.review.findings,
      grounding_kept: kept,
      grounding_total: kept + outcome.dropped.length,
      duration_ms: now() - started,
      cost_usd: outcome.apiCostUsd,
    };
  } catch (err) {
    throw err instanceof EvalCaseError ? err : new EvalCaseError(reasonOf(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
