import type { ConventionCategory } from '@devdigest/shared';
import { SKILL_NAME_SUFFIX, SKILL_SNIPPET_MAX_LINES } from '../constants.js';

/**
 * Assemble accepted conventions into ONE skill body (markdown). Pure: the
 * service hands in verified rows, the user edits the result before saving.
 */

export interface SkillConvention {
  rule: string;
  rationale: string | null;
  category: ConventionCategory;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  occurrences: number | null;
}

const CATEGORY_ORDER: ConventionCategory[] = [
  'structure',
  'naming',
  'imports',
  'typing',
  'error_handling',
  'api',
  'data_access',
  'testing',
  'style',
  'other',
];

const CATEGORY_TITLE: Record<ConventionCategory, string> = {
  structure: 'Structure',
  naming: 'Naming',
  imports: 'Imports',
  typing: 'Typing',
  error_handling: 'Error handling',
  api: 'API',
  data_access: 'Data access',
  testing: 'Testing',
  style: 'Style',
  other: 'Other',
};

const FENCE_LANG: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js', py: 'python', go: 'go',
  rb: 'ruby', java: 'java', kt: 'kotlin', cs: 'csharp', rs: 'rust', php: 'php', vue: 'vue',
  svelte: 'svelte', swift: 'swift', scala: 'scala', json: 'json', md: 'md', yaml: 'yaml', yml: 'yaml',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Default skill name: `<repo>-conventions` (e.g. `payments-api-conventions`). */
export function skillNameFor(repoName: string): string {
  return `${slugify(repoName) || 'repo'}${SKILL_NAME_SUFFIX}`;
}

export function skillDescriptionFor(count: number, repoName: string): string {
  return `${count} house convention${count === 1 ? '' : 's'} extracted from ${repoName}`;
}

/** A fence longer than any backtick run inside the snippet, so the snippet can't close it. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function langFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return FENCE_LANG[ext] ?? '';
}

function renderConvention(c: SkillConvention): string {
  const lines = c.evidenceSnippet.split('\n').slice(0, SKILL_SNIPPET_MAX_LINES);
  const snippet = lines.join('\n');
  const endLine = c.evidenceLine + lines.length - 1;
  const range = endLine > c.evidenceLine ? `${c.evidenceLine}-${endLine}` : `${c.evidenceLine}`;
  const fence = fenceFor(snippet);
  const found = c.occurrences != null ? ` · found in ${c.occurrences} file${c.occurrences === 1 ? '' : 's'}` : '';

  const out = [`### ${slugify(c.rule) || 'rule'}`, c.rule];
  if (c.rationale) out.push('', `Flag: ${c.rationale}`);
  out.push('', `Detected in \`${c.evidencePath}:${range}\`${found}:`, `${fence}${langFor(c.evidencePath)}`, snippet, fence);
  return out.join('\n');
}

export function assembleSkillBody(skillName: string, repoName: string, conventions: readonly SkillConvention[]): string {
  const parts = [
    `# ${skillName}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];
  for (const category of CATEGORY_ORDER) {
    const group = conventions.filter((c) => c.category === category);
    if (!group.length) continue;
    parts.push(`## ${CATEGORY_TITLE[category]}`);
    for (const c of group) parts.push(renderConvention(c));
  }
  return `${parts.join('\n\n')}\n`;
}

export function evidenceFilesOf(conventions: ReadonlyArray<{ evidencePath: string }>): string[] {
  return [...new Set(conventions.map((c) => c.evidencePath))].sort();
}
