import { parse } from 'yaml';
import type { CiWorkflowViolation, CiWorkflowWarning } from '@devdigest/shared';
import { RUNNER_ENTRY, BASE_DIR } from '../constants.js';

/**
 * SPEC-07 AC-14 / AC-16 — static checks on the (possibly user-edited) workflow
 * text. The text is untrusted: parsed inside try/catch, never executed.
 */

export interface WorkflowValidation {
  violations: CiWorkflowViolation[];
  warnings: CiWorkflowWarning[];
}

const RUNNER_INVOCATION = `node ${BASE_DIR}/${RUNNER_ENTRY}`;
const PINNED_RE = /@[0-9a-f]{40}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function usesPullRequestTarget(on: unknown): boolean {
  if (typeof on === 'string') return on === 'pull_request_target';
  if (Array.isArray(on)) return on.includes('pull_request_target');
  if (isObj(on)) return 'pull_request_target' in on;
  return false;
}

function hasForbiddenWrite(permissions: unknown): boolean {
  if (permissions === 'write-all') return true;
  if (!isObj(permissions)) return false;
  return Object.entries(permissions).some(([scope, level]) => level === 'write' && scope !== 'pull-requests');
}

export function validateWorkflow(text: string): WorkflowValidation {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    return {
      violations: [{ code: 'invalid_yaml', message: `Workflow is not valid YAML: ${(err as Error).message}` }],
      warnings: [],
    };
  }
  if (!isObj(doc)) {
    return {
      violations: [{ code: 'invalid_yaml', message: 'Workflow must be a YAML mapping' }],
      warnings: [],
    };
  }

  const violations: CiWorkflowViolation[] = [];
  const warnings: CiWorkflowWarning[] = [];

  if (usesPullRequestTarget(doc.on ?? (doc as Obj)['true'])) {
    violations.push({
      code: 'pull_request_target',
      message: 'The pull_request_target trigger exposes secrets to fork code and is not allowed',
    });
  }

  const jobs = isObj(doc.jobs) ? Object.values(doc.jobs).filter(isObj) : [];

  if (hasForbiddenWrite(doc.permissions) || jobs.some((j) => hasForbiddenWrite(j.permissions))) {
    violations.push({
      code: 'write_permission',
      message: 'Only the pull-requests permission may be granted write access',
    });
  }

  const steps = jobs.flatMap((j) => (Array.isArray(j.steps) ? j.steps.filter(isObj) : []));

  const hasRunner = steps.some((s) => typeof s.run === 'string' && s.run.includes(RUNNER_INVOCATION));
  if (!hasRunner) {
    violations.push({
      code: 'missing_runner_step',
      message: `No step runs the DevDigest runner (${RUNNER_INVOCATION})`,
    });
  }

  for (const s of steps) {
    if (typeof s.uses !== 'string' || s.uses.startsWith('./')) continue;
    if (!PINNED_RE.test(s.uses)) warnings.push({ code: 'unpinned_action', ref: s.uses });
  }

  return { violations, warnings };
}
