import { SkillType } from '@devdigest/shared';
import { DEFAULT_SKILL_TYPE } from '../constants.js';
import type { ParsedSkillMarkdown } from '../types.js';

/**
 * Parse a skill's markdown source text into a `SkillImportDraft`.
 *
 * Frontmatter (a leading `---`…`---` block) is read as FLAT `key: value`
 * pairs — no full YAML parser. A handful of scalar fields (`name`,
 * `description`, `type`/`category`) is all this needs, and a real YAML parser
 * would be unjustified complexity AND extra attack surface for untrusted
 * imported content.
 *
 * Without frontmatter (or a missing field): `name` falls back to the first
 * `# Heading`, then the filename; `description` falls back to the first
 * non-empty paragraph; `type` falls back to 'custom'. An unrecognized `type`
 * value in frontmatter also falls back to 'custom', with a warning.
 */
export function parseSkillMarkdown(text: string, filename = 'skill.md'): ParsedSkillMarkdown {
  const warnings: string[] = [];
  const { frontmatter, body } = splitFrontmatter(text);

  const name = (frontmatter.name ?? firstHeading(body) ?? filenameToName(filename)).trim();
  const description = (frontmatter.description ?? firstParagraph(body) ?? '').trim();
  const typeRaw = frontmatter.type ?? frontmatter.category;

  let type: SkillType = DEFAULT_SKILL_TYPE;
  if (typeRaw) {
    const parsed = SkillType.safeParse(typeRaw.trim());
    if (parsed.success) {
      type = parsed.data;
    } else {
      warnings.push(`Unrecognized skill type "${typeRaw}" — defaulting to "custom".`);
    }
  }

  return {
    draft: { name, description, type, body: body.trim() },
    warnings,
  };
}

/**
 * Split a leading `---`/`---` frontmatter block off the body. Returns
 * `{ frontmatter: {}, body: text }` unchanged when there's no well-formed
 * frontmatter block (no second `---` found).
 */
function splitFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const stripped = text.replace(/^﻿/, ''); // strip a leading BOM
  if (!stripped.startsWith('---')) return { frontmatter: {}, body: stripped };

  const closeIdx = stripped.indexOf('\n---', 3);
  if (closeIdx === -1) return { frontmatter: {}, body: stripped };

  const raw = stripped.slice(3, closeIdx).trim();
  const body = stripped.slice(closeIdx + 4).replace(/^\r?\n/, '');

  const frontmatter: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    frontmatter[key] = unquote(m[2]!.trim());
  }
  return { frontmatter, body };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function firstHeading(body: string): string | undefined {
  const m = body.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim();
}

function firstParagraph(body: string): string | undefined {
  const paras: string[] = [];
  let collecting = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue; // headings aren't part of the description
    if (line.length === 0) {
      if (collecting) break;
      continue;
    }
    collecting = true;
    paras.push(line);
  }
  return paras.length > 0 ? paras.join(' ') : undefined;
}

function filenameToName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  return base.replace(/\.md$/i, '') || 'Imported skill';
}
