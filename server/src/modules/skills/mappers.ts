import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { hasInjection } from '../_shared/injection.js';
import type { SkillRow, SkillVersionRow } from './ports.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping. No I/O.
 * `body_tokens` / `agent_count` are server-computed (not persisted columns),
 * so callers (service.ts) pass them in rather than this file reaching for a
 * tokenizer or a second query.
 */

export interface SkillDtoExtras {
  bodyTokens: number;
  agentCount: number;
}

export function toSkillDto(row: SkillRow, extras: SkillDtoExtras): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: (row.evidenceFiles as string[] | null) ?? null,
    body_tokens: extras.bodyTokens,
    agent_count: extras.agentCount,
    injection_detected: hasInjection(row.body),
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}
