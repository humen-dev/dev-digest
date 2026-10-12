import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { agentSlug } from '../src/modules/ci/domain/slug.js';
import { buildAgentManifest, renderManifestYaml } from '../src/modules/ci/domain/manifest.js';
import { renderMemoryJsonl } from '../src/modules/ci/domain/memory-jsonl.js';
import { workflowVersion } from '../src/modules/ci/domain/workflow-version.js';

describe('agentSlug', () => {
  it.each([
    ['Security Reviewer', 'security-reviewer'],
    ['  --A//B__C  ', 'a-b-c'],
    ['', 'agent'],
    ['!!!', 'agent'],
    ['Ünï', 'n'],
  ])('%j -> %j', (input, expected) => {
    expect(agentSlug(input)).toBe(expected);
  });

  it('caps at 64 characters without a trailing dash', () => {
    const slug = agentSlug(`${'a'.repeat(63)} ${'b'.repeat(10)}`);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('manifest', () => {
  const agent = {
    name: 'Sec: "Rev"\nnewline',
    model: 'anthropic/claude-sonnet',
    systemPrompt: 'Line 1\n$(curl x) `id` "; rm -rf / #',
    strategy: 'map-reduce' as const,
    ciFailOn: 'warning' as const,
    skillSlugs: ['zeta', 'alpha'],
  };

  it('round-trips through AgentManifest with provider openrouter and ordered skills (AC-9)', () => {
    const yaml = renderManifestYaml(buildAgentManifest(agent));
    const parsed = AgentManifest.parse(parse(yaml));
    expect(parsed).toEqual({
      name: agent.name,
      provider: 'openrouter',
      model: agent.model,
      system_prompt: agent.systemPrompt,
      skills: ['zeta', 'alpha'],
      strategy: 'map-reduce',
      ci_fail_on: 'warning',
    });
  });

  it('accepts an empty skill list (EC-10)', () => {
    const m = buildAgentManifest({ ...agent, skillSlugs: [] });
    expect(m.skills).toEqual([]);
  });
});

describe('renderMemoryJsonl', () => {
  it('renders only kind and content per line (AC-11)', () => {
    const out = renderMemoryJsonl([
      { kind: 'a', content: 'x', extra: 1 } as { kind: string; content: string },
      { kind: 'b', content: 'y\nz' },
    ]);
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'a', content: 'x' });
    expect(JSON.parse(lines[1]!)).toEqual({ kind: 'b', content: 'y\nz' });
  });

  it('renders an empty string for no rows', () => {
    expect(renderMemoryJsonl([])).toBe('');
  });
});

describe('workflowVersion', () => {
  it('is the first 12 hex of sha256', () => {
    expect(workflowVersion('abc')).toBe('ba7816bf8f01');
  });
});
