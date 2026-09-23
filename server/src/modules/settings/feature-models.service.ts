import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
} from '@devdigest/shared';
import { rowsToSettings } from './helpers.js';
import type { SettingsReader } from './ports.js';

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings (Settings → Models)
 * instead of a hardcoded module constant. When the workspace hasn't chosen one,
 * they fall back to the registry default in `FEATURE_MODELS`.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

export class FeatureModelResolver {
  constructor(private readonly settings: SettingsReader) {}

  /** The workspace's override for `id`, or `undefined` when unset/invalid. */
  async override(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice | undefined> {
    const rows = await this.settings.listByWorkspace(workspaceId);
    const fm = (rowsToSettings(rows) as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.[id]);
    return parsed.success ? parsed.data : undefined;
  }

  /** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
  async resolve(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.override(workspaceId, id)) ?? defaultFeatureModel(id);
  }
}
