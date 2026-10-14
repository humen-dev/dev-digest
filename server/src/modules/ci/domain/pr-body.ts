import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import { OPENROUTER_SECRET_NAME, REQUIRED_CHECK_NAME } from '../constants.js';

/** SPEC-08 AC-37 — description of the export pull request. Pure. */

export interface ExportPrBodyInput {
  repo: string;
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
}

const PERMISSIONS: Record<CiPostAs, string> = {
  github_review: '`contents: read` and `pull-requests: write` (posts a GitHub review)',
  pr_comment: '`contents: read` and `pull-requests: write` (posts a PR comment)',
  none: '`contents: read` only (nothing is posted; the exit code is the result)',
};

export function renderExportPrBody(input: ExportPrBodyInput): string {
  const secretsUrl = `https://github.com/${input.repo}/settings/secrets/actions`;
  return [
    '## Add DevDigest CI review',
    '',
    'This PR adds an AI pull-request review that runs in GitHub Actions.',
    '',
    '### Permissions',
    PERMISSIONS[input.postAs],
    '',
    '### Triggers',
    `Runs on pull request events: ${input.triggers.map((t) => `\`${t}\``).join(', ')}.`,
    '',
    '### Before merging',
    `Add the \`${OPENROUTER_SECRET_NAME}\` repository secret: ${secretsUrl}`,
    '',
    '### Pull requests from forks',
    'The review job does not run for pull requests from forks, so the check shows as skipped. ' +
      'If you mark it as required, a skipped required check is treated as passing by GitHub.',
    '',
    '### Required check',
    `To block merges, mark \`${REQUIRED_CHECK_NAME}\` as a required status check in branch protection.`,
    '',
    '### Review these files',
    'Add a CODEOWNERS rule so changes to the review setup need an owner:',
    '```',
    '.devdigest/**          @your-org/maintainers',
    '.github/workflows/**   @your-org/maintainers',
    '```',
    '',
  ].join('\n');
}
