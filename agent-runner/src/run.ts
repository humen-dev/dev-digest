import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type {
  LLMProvider,
  GitHubReviewPayload,
  CiResultArtifact,
  CiPostOutcome,
  Verdict,
} from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { loadManifest } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { resolvePrContext, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact } from './artifact.js';
import { RunnerError } from './errors.js';

/**
 * `runCi` — the runner's single orchestration entry point (T8). Mirrors the
 * pipeline a local studio review runs (assemblePrompt/wrapUntrusted →
 * completeStructured → groundFindings, all INSIDE `reviewPullRequest`) so CI
 * and local stay in parity (AC-36): this file never re-implements or
 * hand-rolls any of that — it only resolves CI-specific inputs (manifest,
 * skills, diff, PR context) and hands them to the SAME reviewer-core engine
 * the studio calls, then turns the grounded result into GitHub side effects.
 *
 * Deterministic gate (AC-23): the GitHub review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + the manifest's `ci_fail_on`
 * against the GROUNDED findings — never from `review.verdict` (the model's
 * self-report), which is discarded here on purpose.
 *
 * Hard-fail (Q5, SPEC-07 AC-51): a single try/catch wraps the pipeline. Any
 * failure up to "we have a grounded review" — invalid manifest (AC-20), missing
 * skill file, unresolvable CI context, diff-fetch failure, or an LLM/model-call
 * error inside `reviewPullRequest` — short-circuits to
 * `{ exitCode: 1, artifact: null, posted: null }` before any GitHub post or
 * artifact write (no synthetic review skeleton).
 *
 * Posting is the ONE stage with its own catch (SPEC-07 AC-49, EC-18): once the
 * review is grounded, a failed post is recorded as `post_outcome: 'post_failed'`,
 * the artifact is still written AFTER the post, and the exit code is decided by
 * the gate alone.
 */

export type PostAs = 'github_review' | 'pr_comment' | 'none';

export interface RunCiDeps {
  /** Directory containing `agents/` and `skills/` (checked-in `.devdigest/`). */
  devdigestDir: string;
  env: CiEnv;
  /** Injected LLM provider — `OpenRouterProvider` in production, a stub in tests. */
  llm: LLMProvider;
  /** How to post the result — `'github_review' | 'pr_comment' | 'none'` (AC-24). */
  postAs: PostAs;
  /** Absolute path to write the `CiResultArtifact` JSON to. */
  resultPath: string;
  fetchImpl?: FetchLike;
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
  writeFile?: typeof writeFileSync;
  now?: () => number;
  /**
   * Override diff retrieval (tests supply a fixture diff directly instead of
   * hitting the GitHub API). Defaults to `fetchPrDiff` via the GitHub REST API.
   */
  fetchDiff?: (
    ctx: { owner: string; repo: string; prNumber: number },
    token: string,
    fetchImpl: FetchLike,
  ) => Promise<string>;
}

export interface RunCiSuccess {
  exitCode: number;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload; outcome: CiPostOutcome; error?: string };
  blockers: number;
  gateTriggered: boolean;
  error?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure;

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  try {
    // 1. Load + validate the manifest BEFORE it is used for anything (AC-20).
    const manifest = loadManifest(deps.devdigestDir, { readFile, readDir });
    const skills = loadSkillBodies(deps.devdigestDir, manifest.skills, readFile);

    // 2. Resolve CI context (PR number/title/body/repo) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);

    const githubToken = deps.env.GITHUB_TOKEN;
    if (deps.postAs !== 'none' && !githubToken) {
      throw new RunnerError(`GITHUB_TOKEN is required to post as '${deps.postAs}'`);
    }

    // 3. Assemble the diff from the CI context. Strip DevDigest's own exported
    //    artifacts (`.devdigest/**`, the generated workflow) BEFORE parse: the
    //    minified runner bundle would otherwise fail the whole review with a
    //    GitHub 422 "diff too large", and reviewing our own config is noise.
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    const diff = parseUnifiedDiff(stripIgnoredFiles(rawDiff));

    // 4. Run the SAME engine the studio uses. `reviewPullRequest` internally
    //    calls `assemblePrompt`/`wrapUntrusted` (diff → `<untrusted
    //    source="diff">`, prDescription → `<untrusted source="pr-description">`,
    //    AC-21) and the mandatory `groundFindings()` gate (AC-22: an all-dropped
    //    result is a valid zero-finding review, not an error — it flows through
    //    normally below).
    const start = now();
    const outcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      diff,
      llm: deps.llm,
      strategy: manifest.strategy,
      skills,
      prDescription: ctx.body,
      task: `Review PR #${ctx.prNumber}: ${ctx.title}`,
    });
    const durationMs = now() - start;

    // 5. Deterministic verdict/gate from GROUNDED findings + `ci_fail_on`
    //    (AC-23) — never `outcome.review.verdict`.
    const payload = toReviewPayload(outcome.review, {
      failOn: manifest.ci_fail_on,
      diff,
      title: manifest.name,
    });
    const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
    const triggered = gateTriggered(outcome.review.findings, manifest.ci_fail_on);
    const verdict = verdictFromEvent(payload.event);

    // 6. Post per `post_as` (SPEC-07 AC-46..48) in its OWN catch: a GitHub-side
    //    failure is recorded, never turned into a hard failure (EC-18).
    let postOutcome: CiPostOutcome = 'not_requested';
    let postError: string | undefined;
    if (deps.postAs !== 'none') {
      try {
        if (deps.postAs === 'github_review') {
          await postGithubReview(ctx, githubToken as string, payload, fetchImpl);
        } else {
          await postPrComment(ctx, githubToken as string, payload.body, fetchImpl);
        }
        postOutcome = 'posted';
      } catch (err) {
        postOutcome = 'post_failed';
        postError = err instanceof Error ? err.message : String(err);
      }
    }

    // 7. Write the artifact AFTER posting so it records the post outcome (AC-49).
    const artifact = buildResultArtifact({
      findings: outcome.review.findings,
      costUsd: outcome.costUsd,
      durationMs,
      agent: manifest.name,
      prNumber: ctx.prNumber,
      verdict,
      blockers,
      ciFailOn: manifest.ci_fail_on,
      postOutcome,
    });
    writeFile(deps.resultPath, `${JSON.stringify(artifact, null, 2)}\n`);

    // 8. Exit non-zero IFF the gate triggered (AC-45), whatever the post outcome.
    return {
      exitCode: triggered ? 1 : 0,
      artifact,
      posted: { kind: deps.postAs, payload, outcome: postOutcome, ...(postError ? { error: postError } : {}) },
      blockers,
      gateTriggered: triggered,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no artifact, no synthetic
    // review skeleton — regardless of which stage above threw.
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, artifact: null, posted: null, error: message };
  }
}

/**
 * The deterministic verdict, read off the event `toReviewPayload` already
 * derived from grounded severities + `ci_fail_on` (never the model's verdict).
 */
function verdictFromEvent(event: GitHubReviewPayload['event']): Verdict {
  if (event === 'APPROVE') return 'approve';
  if (event === 'REQUEST_CHANGES') return 'request_changes';
  return 'comment';
}
