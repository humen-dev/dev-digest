import { describe, expect, it } from 'vitest';
import { renderExportPrBody } from '../src/modules/ci/domain/pr-body.js';
import { REQUIRED_CHECK_NAME } from '../src/modules/ci/constants.js';

describe('renderExportPrBody (AC-37)', () => {
  const body = renderExportPrBody({ repo: 'acme/app', triggers: ['opened', 'synchronize'], postAs: 'github_review' });

  it('lists permissions, triggers, secrets link, fork rule, CODEOWNERS and the check name', () => {
    expect(body).toContain('pull-requests: write');
    expect(body).toContain('`opened`, `synchronize`');
    expect(body).toContain('https://github.com/acme/app/settings/secrets/actions');
    expect(body).toMatch(/forks/);
    expect(body).toMatch(/skipped/);
    expect(body).toContain('.devdigest/**');
    expect(body).toContain('.github/workflows/**');
    expect(body).toContain(REQUIRED_CHECK_NAME);
  });

  it('states read-only permissions for post_as none', () => {
    const none = renderExportPrBody({ repo: 'a/b', triggers: ['opened'], postAs: 'none' });
    expect(none).toContain('`contents: read` only');
    expect(none).not.toContain('pull-requests: write');
  });
});
