import { describe, expect, it } from 'vitest';
import { CiTargetOption } from '@devdigest/shared';
import { CI_TARGETS } from '../src/modules/ci/domain/targets.js';

describe('CI_TARGETS (AC-3)', () => {
  it('contains exactly the gha entry and matches the contract', () => {
    expect(CI_TARGETS).toEqual([{ target: 'gha', label_key: 'exportWizard.targets.gha' }]);
    for (const t of CI_TARGETS) expect(CiTargetOption.safeParse(t).success).toBe(true);
  });
});
