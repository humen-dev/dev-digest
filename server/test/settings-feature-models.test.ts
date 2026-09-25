import { describe, it, expect } from 'vitest';
import {
  FeatureModelResolver,
  defaultFeatureModel,
} from '../src/modules/settings/feature-models.service.js';
import type { SettingsReader } from '../src/modules/settings/ports.js';

const reader = (value: unknown): SettingsReader => ({
  listByWorkspace: async () => [{ key: 'feature_models', value }],
});

describe('FeatureModelResolver', () => {
  it('falls back to the registry default when the workspace has no choice', async () => {
    const r = new FeatureModelResolver({ listByWorkspace: async () => [] });
    expect(await r.override('ws', 'conventions')).toBeUndefined();
    expect(await r.resolve('ws', 'conventions')).toEqual(defaultFeatureModel('conventions'));
  });

  it('returns the workspace override for the feature', async () => {
    const r = new FeatureModelResolver(
      reader({ conventions: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } }),
    );
    expect(await r.resolve('ws', 'conventions')).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-4.7-flash',
    });
  });

  it('ignores an invalid stored value', async () => {
    const r = new FeatureModelResolver(reader({ conventions: { provider: 'nope', model: 1 } }));
    expect(await r.override('ws', 'conventions')).toBeUndefined();
    expect(await r.resolve('ws', 'conventions')).toEqual(defaultFeatureModel('conventions'));
  });
});
