/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ordered system skills', () => {
  it('puts skills only in the system message, in order, before the injection guard', () => {
    const skills = ['### Skill: First\nFIRST-RULE', '### Skill: Second\nSECOND-RULE'];
    for (const order of [skills, [...skills].reverse()]) {
      const { messages, assembly } = assemblePrompt({ system: 'AGENT', diff: 'DIFF', skills: order });
      const system = messages.find((m) => m.role === 'system')!.content;
      const user = messages.find((m) => m.role === 'user')!.content;
      expect(system.indexOf(order[0]!)).toBeLessThan(system.indexOf(order[1]!));
      expect(system.indexOf(order[1]!)).toBeLessThan(system.indexOf('SECURITY — read carefully'));
      expect(user).not.toContain('## Skills / rules');
      expect(user).not.toContain('FIRST-RULE');
      expect(user).toContain('<untrusted source="diff">');
      expect(assembly.system).toBe(system);
      expect(assembly.skills).toBe(order.join('\n\n'));
    }
  });

  it.each([undefined, []])('omits empty skills from both messages and the trace: %j', (skills) => {
    const { messages, assembly } = assemblePrompt({ system: 'AGENT', diff: 'DIFF', skills });
    expect(messages.every((m) => !m.content.includes('## Skills / rules'))).toBe(true);
    expect(assembly.skills).toBeNull();
  });
});
