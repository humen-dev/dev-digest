import { describe, it, expect } from 'vitest';
import { renderSkillBlocks } from '../src/modules/reviews/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

/**
 * `renderSkillBlocks` — the pure rendering step behind run-executor's
 * `buildSkillBlocks`. Covers: blocks render in the given (already
 * `order`-sorted) sequence, a disabled skill is filtered out, and an empty
 * input produces an empty array (→ run-executor omits `skills:` entirely).
 */

function skillRow(overrides: Partial<LinkedSkillRow['skill']> & Pick<LinkedSkillRow['skill'], 'id' | 'name'>): LinkedSkillRow['skill'] {
  return {
    workspaceId: 'w1',
    description: 'desc',
    type: 'rubric',
    source: 'manual',
    body: `Body of ${overrides.name}`,
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('renderSkillBlocks', () => {
  it('renders each enabled skill as "### Skill: <name> (<type>)\\n<body>"', () => {
    const links: LinkedSkillRow[] = [
      { skill: skillRow({ id: 's1', name: 'Uncovered Branch Gate', type: 'rubric' }), order: 0 },
    ];
    const blocks = renderSkillBlocks(links);
    expect(blocks).toEqual(['### Skill: Uncovered Branch Gate (rubric)\nBody of Uncovered Branch Gate']);
  });

  it('preserves the given (order-sorted) sequence', () => {
    const links: LinkedSkillRow[] = [
      { skill: skillRow({ id: 's1', name: 'First' }), order: 0 },
      { skill: skillRow({ id: 's2', name: 'Second' }), order: 1 },
      { skill: skillRow({ id: 's3', name: 'Third' }), order: 2 },
    ];
    const blocks = renderSkillBlocks(links);
    expect(blocks.map((b) => b.split('\n')[0])).toEqual([
      '### Skill: First (rubric)',
      '### Skill: Second (rubric)',
      '### Skill: Third (rubric)',
    ]);
  });

  it('drops a disabled skill — it never reaches the prompt', () => {
    const links: LinkedSkillRow[] = [
      { skill: skillRow({ id: 's1', name: 'Enabled One', enabled: true }), order: 0 },
      { skill: skillRow({ id: 's2', name: 'Disabled One', enabled: false }), order: 1 },
      { skill: skillRow({ id: 's3', name: 'Enabled Two', enabled: true }), order: 2 },
    ];
    const blocks = renderSkillBlocks(links);
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.includes('Disabled One'))).toBe(false);
    expect(blocks[0]).toContain('Enabled One');
    expect(blocks[1]).toContain('Enabled Two');
  });

  it('returns an empty array for an empty link list (caller omits `skills:` entirely)', () => {
    expect(renderSkillBlocks([])).toEqual([]);
  });

  it('returns an empty array when every linked skill is disabled', () => {
    const links: LinkedSkillRow[] = [
      { skill: skillRow({ id: 's1', name: 'Off', enabled: false }), order: 0 },
    ];
    expect(renderSkillBlocks(links)).toEqual([]);
  });
});
