import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseSkillMarkdown } from '../src/modules/skills/domain/parse-markdown.js';
import { extractSkillFromArchive } from '../src/modules/skills/domain/parse-archive.js';
import { ValidationError } from '../src/platform/errors.js';
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_UNCOMPRESSED_BYTES,
} from '../src/modules/skills/constants.js';

/**
 * Skill import — markdown parsing (with/without frontmatter) and archive
 * extraction (SKILL.md selection, ignored entries, path traversal, and
 * zip-bomb size/entry-count limits).
 */

describe('parseSkillMarkdown', () => {
  it('reads name/description/type from frontmatter', () => {
    const text = [
      '---',
      'name: Uncovered Branch Gate',
      'description: Every new branch needs a test.',
      'type: rubric',
      '---',
      '',
      'Body text here.',
    ].join('\n');
    const { draft, warnings } = parseSkillMarkdown(text);
    expect(draft).toEqual({
      name: 'Uncovered Branch Gate',
      description: 'Every new branch needs a test.',
      type: 'rubric',
      body: 'Body text here.',
    });
    expect(warnings).toEqual([]);
  });

  it('accepts `category` as an alias for `type` in frontmatter', () => {
    const text = '---\nname: X\ncategory: convention\n---\nBody.';
    const { draft } = parseSkillMarkdown(text);
    expect(draft.type).toBe('convention');
  });

  it('falls back to the first heading, first paragraph, and "custom" type without frontmatter', () => {
    const text = '# Mock Overuse Gate\n\nDo not mock the thing under test.\n\nMore detail below.';
    const { draft, warnings } = parseSkillMarkdown(text, 'mock-overuse.md');
    expect(draft.name).toBe('Mock Overuse Gate');
    expect(draft.description).toBe('Do not mock the thing under test.');
    expect(draft.type).toBe('custom');
    expect(warnings).toEqual([]);
  });

  it('falls back to the filename when there is no heading and no frontmatter name', () => {
    const { draft } = parseSkillMarkdown('Just some body text, no heading.', 'flaky-test-patterns.md');
    expect(draft.name).toBe('flaky-test-patterns');
  });

  it('defaults an unrecognized frontmatter type to "custom" and warns', () => {
    const text = '---\nname: X\ntype: not-a-real-type\n---\nBody.';
    const { draft, warnings } = parseSkillMarkdown(text);
    expect(draft.type).toBe('custom');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not-a-real-type/);
  });

  it('strips quotes around frontmatter values', () => {
    const text = '---\nname: "Quoted Name"\ndescription: \'Single quoted\'\n---\nBody.';
    const { draft } = parseSkillMarkdown(text);
    expect(draft.name).toBe('Quoted Name');
    expect(draft.description).toBe('Single quoted');
  });
});

function zipOf(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) entries[path] = strToU8(content);
  return zipSync(entries);
}

const SKILL_BODY = '---\nname: Flaky Test Patterns\ndescription: Catches flaky tests.\ntype: custom\n---\nBody.';

describe('extractSkillFromArchive', () => {
  it('selects SKILL.md and reports every other entry as ignored', () => {
    const bytes = zipOf({
      'SKILL.md': SKILL_BODY,
      'scripts/install.sh': '#!/bin/sh\necho hi',
      'scripts/check.py': 'print("hi")',
      'README.md': '# unrelated',
    });
    const { draft, ignored_entries, warnings } = extractSkillFromArchive(bytes);
    expect(draft.name).toBe('Flaky Test Patterns');
    expect(ignored_entries.sort()).toEqual(
      ['scripts/install.sh', 'scripts/check.py', 'README.md'].sort(),
    );
    // Both scripts/* entries produce a warning; the unrelated README does not.
    expect(warnings.filter((w) => w.includes('scripts/install.sh'))).toHaveLength(1);
    expect(warnings.filter((w) => w.includes('scripts/check.py'))).toHaveLength(1);
    expect(warnings.some((w) => w.includes('README.md'))).toBe(false);
  });

  it('picks the shallowest SKILL.md when more than one exists', () => {
    const bytes = zipOf({
      'SKILL.md': SKILL_BODY,
      'nested/dir/SKILL.md': '# Nested\nShould not be picked.',
    });
    const { draft } = extractSkillFromArchive(bytes);
    expect(draft.name).toBe('Flaky Test Patterns');
  });

  it('falls back to the single .md file when there is no SKILL.md', () => {
    const bytes = zipOf({ 'my-skill.md': SKILL_BODY, 'notes.txt': 'not markdown' });
    const { draft, ignored_entries } = extractSkillFromArchive(bytes);
    expect(draft.name).toBe('Flaky Test Patterns');
    expect(ignored_entries).toEqual(['notes.txt']);
  });

  it('throws when there is no SKILL.md and no unambiguous single .md file', () => {
    const noMd = zipOf({ 'notes.txt': 'nothing markdown here' });
    expect(() => extractSkillFromArchive(noMd)).toThrow(ValidationError);

    const twoMd = zipOf({ 'a.md': SKILL_BODY, 'b.md': SKILL_BODY });
    expect(() => extractSkillFromArchive(twoMd)).toThrow(ValidationError);
  });

  it('rejects path traversal entries before reading any content', () => {
    const bytes = zipOf({
      'SKILL.md': SKILL_BODY,
      '../../etc/passwd': 'evil',
    });
    expect(() => extractSkillFromArchive(bytes)).toThrow(ValidationError);
  });

  it('rejects an absolute-path entry', () => {
    const bytes = zipOf({ 'SKILL.md': SKILL_BODY, '/etc/passwd': 'evil' });
    expect(() => extractSkillFromArchive(bytes)).toThrow(ValidationError);
  });

  it('rejects an archive with too many entries (zip-bomb entry-count guard)', () => {
    const files: Record<string, string> = { 'SKILL.md': SKILL_BODY };
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES + 5; i += 1) {
      files[`junk/file-${i}.txt`] = 'x';
    }
    const bytes = zipOf(files);
    expect(() => extractSkillFromArchive(bytes)).toThrow(ValidationError);
  });

  it('rejects an archive whose total uncompressed size exceeds the limit', () => {
    // A single large, highly-compressible entry — small on the wire, huge
    // once inflated. `originalSize` (from the zip's own metadata) catches
    // this BEFORE that entry is actually inflated.
    const big = 'a'.repeat(MAX_UNCOMPRESSED_BYTES + 1024);
    const bytes = zipOf({ 'SKILL.md': SKILL_BODY, 'big.txt': big });
    expect(() => extractSkillFromArchive(bytes)).toThrow(ValidationError);
  });
});
