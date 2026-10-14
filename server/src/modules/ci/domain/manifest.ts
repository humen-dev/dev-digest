import { stringify as toYaml } from 'yaml';
import { AgentManifest, type CiFailOn, type ReviewStrategy } from '@devdigest/shared';

/**
 * SPEC-08 AC-9 — agent config → validated `AgentManifest` → YAML. Pure. The
 * manifest is validated against the same contract the runner re-validates, so
 * a manifest that cannot be parsed on the other end is never produced.
 */

export interface ManifestSourceAgent {
  name: string;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  /** Skill slugs, in the agent's order. */
  skillSlugs: string[];
}

export function buildAgentManifest(agent: ManifestSourceAgent): AgentManifest {
  const result = AgentManifest.safeParse({
    name: agent.name,
    provider: 'openrouter', // the CI runner supports OpenRouter only
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: agent.skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
  if (!result.success) {
    throw new Error(`Generated agent manifest failed validation: ${result.error.message}`);
  }
  return result.data;
}

/** Serialised by the `yaml` package — never hand-quoted, so hostile text round-trips. */
export function renderManifestYaml(manifest: AgentManifest): string {
  return toYaml(manifest);
}
