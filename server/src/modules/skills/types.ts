import type { SkillImportDraft, SkillSource, SkillType } from '@devdigest/shared';

/**
 * Module-local types: domain-layer results (parsing) and the repository's
 * insert/update shapes. Public DTOs (`Skill`, `SkillVersion`,
 * `SkillImportPreview`, …) live in `@devdigest/shared` — this file only holds
 * what's internal to this module.
 */

/** Result of parsing a single markdown skill file's raw text. */
export interface ParsedSkillMarkdown {
  draft: SkillImportDraft;
  warnings: string[];
}

/** Result of extracting a skill from a `.zip` archive buffer. */
export interface ExtractedSkillArchive {
  draft: SkillImportDraft;
  /** Archive entries the product deliberately did NOT process. */
  ignored_entries: string[];
  warnings: string[];
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  /** Defaults to 'manual' when omitted. */
  source?: SkillSource;
  body: string;
  /** Defaults to true when omitted. */
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  /**
   * Note recorded on the version this update snapshots. Only meaningful when
   * `body` actually changes — an update that bumps nothing has no version to
   * attach it to, so it is dropped rather than stored against the old one.
   */
  versionMessage?: string | null;
}
