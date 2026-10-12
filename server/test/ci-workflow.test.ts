import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildWorkflowYaml } from '../src/modules/ci/domain/workflow.js';
import { validateWorkflow } from '../src/modules/ci/domain/workflow-validate.js';
import { BOOTSTRAP_NOTICE, PINNED_ACTIONS } from '../src/modules/ci/constants.js';

type Step = { name: string; id?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
const gen = (triggers: ('opened' | 'synchronize' | 'reopened')[], postAs: 'github_review' | 'pr_comment' | 'none') => {
  const text = buildWorkflowYaml({ triggers, postAs });
  const doc = parse(text) as any;
  return { text, doc, job: doc.jobs.review, steps: doc.jobs.review.steps as Step[] };
};

describe('buildWorkflowYaml', () => {
  it('on equals the selected triggers in canonical order (AC-17)', () => {
    const { doc } = gen(['reopened', 'opened'], 'github_review');
    expect(doc.on).toEqual({ pull_request: { types: ['opened', 'reopened'] } });
  });

  it('permissions: two keys, or one for none (AC-18, AC-19)', () => {
    expect(gen(['opened'], 'github_review').job.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(gen(['opened'], 'pr_comment').job.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(gen(['opened'], 'none').job.permissions).toEqual({ contents: 'read' });
  });

  it('every uses is pinned to a 40-hex sha with a tag comment (AC-20)', () => {
    const { text, steps } = gen(['opened'], 'none');
    const uses = steps.map((s) => s.uses).filter(Boolean) as string[];
    expect(uses).toHaveLength(3);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
    for (const a of Object.values(PINNED_ACTIONS)) expect(text).toContain(`${a.repo}@${a.sha} # ${a.version}`);
  });

  it('job if is the fork check, with timeout and concurrency (AC-21, AC-24, NFR-1)', () => {
    const { doc, job } = gen(['opened'], 'none');
    expect(job.if).toBe('github.event.pull_request.head.repo.fork == false');
    expect(job['timeout-minutes']).toBe(15);
    expect(doc.concurrency).toEqual({
      group: 'devdigest-review-${{ github.event.pull_request.number }}',
      'cancel-in-progress': true,
    });
  });

  it('only the base checkout precedes the guard; later steps are guarded (AC-84, AC-25)', () => {
    const { steps } = gen(['opened'], 'github_review');
    expect(steps[0]!.uses).toContain('actions/checkout');
    expect(steps[0]!.with).toMatchObject({ path: '.devdigest-base', 'persist-credentials': false });
    expect(steps[1]!.id).toBe('guard');
    expect(steps[1]!.run).toContain(BOOTSTRAP_NOTICE);
    const passed = "steps.guard.outputs.installed == 'true'";
    expect(steps[2]!.if).toBe(passed);
    expect(steps[3]!.if).toBe(passed);
    expect(steps[4]!.if).toBe(`always() && ${passed}`);
    expect(steps[5]!.if).toBe(`always() && ${passed}`);
  });

  it('runner and DEVDIGEST_DIR point at the base checkout; post-as takes all values (AC-22, AC-23)', () => {
    for (const postAs of ['github_review', 'pr_comment', 'none'] as const) {
      const review = gen(['opened'], postAs).steps[3]!;
      expect(review.run).toBe('node .devdigest-base/.devdigest/runner/index.js');
      expect(review.env!.DEVDIGEST_DIR).toBe('.devdigest-base/.devdigest');
      expect(review.env!.DEVDIGEST_POST_AS).toBe(postAs);
      expect(review.env!.OPENROUTER_API_KEY).toBe('${{ secrets.OPENROUTER_API_KEY }}');
    }
  });

  it('sidecar step env carries head sha, repo, numeric repo id, PR number and title (AC-50)', () => {
    const meta = gen(['opened'], 'none').steps[4]!;
    expect(Object.keys(meta.env!).sort()).toEqual([
      'DEVDIGEST_COMMIT_SHA',
      'DEVDIGEST_PR_NUMBER',
      'DEVDIGEST_PR_TITLE',
      'DEVDIGEST_REPOSITORY',
      'DEVDIGEST_REPOSITORY_ID',
    ]);
    expect(meta.env!.DEVDIGEST_PR_TITLE).toBe('${{ github.event.pull_request.title }}');
  });

  it('no expression inside any run value; hostile title only as env (AC-26, UT-2)', () => {
    const { steps, text } = gen(['opened'], 'github_review');
    for (const s of steps) if (s.run) expect(s.run).not.toContain('${{');
    expect(text).not.toContain('$(curl x)');
  });

  it('generated workflow passes validation with no violations or warnings', () => {
    const { text } = gen(['opened', 'synchronize'], 'github_review');
    expect(validateWorkflow(text)).toEqual({ violations: [], warnings: [] });
  });

  it('rejects an unknown post_as', () => {
    expect(() => buildWorkflowYaml({ triggers: ['opened'], postAs: 'x' as never })).toThrow();
  });
});
