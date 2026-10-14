import { describe, it, expect } from 'vitest';
import { installationState, isOutdated } from '../src/modules/ci/domain/installation-state.js';
import { GENERATOR_VERSION } from '../src/modules/ci/constants.js';

describe('installationState (AC-58)', () => {
  it('merged -> active', () => {
    expect(installationState({ prState: 'merged', hasIngestedRun: false })).toBe('active');
  });
  it('closed -> pr_closed', () => {
    expect(installationState({ prState: 'closed', hasIngestedRun: false })).toBe('pr_closed');
  });
  it('open -> pr_open', () => {
    expect(installationState({ prState: 'open', hasIngestedRun: false })).toBe('pr_open');
  });
  it('open with an ingested run -> active', () => {
    expect(installationState({ prState: 'open', hasIngestedRun: true })).toBe('active');
  });
});

describe('isOutdated (AC-60)', () => {
  const base = { agentVersion: 2, generatorVersion: GENERATOR_VERSION };
  it('equal versions -> false', () => {
    expect(isOutdated(base, 2)).toBe(false);
  });
  it('bumped agent version -> true', () => {
    expect(isOutdated(base, 3)).toBe(true);
  });
  it('older generator version -> true', () => {
    expect(isOutdated({ ...base, generatorVersion: GENERATOR_VERSION - 1 }, 2)).toBe(true);
  });
  it('unknown installed versions -> false', () => {
    expect(isOutdated({ agentVersion: null, generatorVersion: null }, 5)).toBe(false);
  });
});
