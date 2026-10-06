import { pgTable, uuid, text, integer, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { agents } from './agents';
import { skills } from './skills';

/**
 * Project Context (SPEC-01, §3.6) — repo-relative Markdown doc paths attached
 * to an agent or a skill, each with its stored display `position` (so a
 * reorder round-trips exactly: PUT [b,a] → GET [b,a]). `ON DELETE CASCADE`
 * means deleting an agent/skill never leaves an orphan row (EC-14) — no
 * application-level cleanup needed.
 */

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.path] }),
    pathIdx: index('agent_context_docs_path_idx').on(t.path),
    pathLenCheck: check('agent_context_docs_path_check', sql`length(${t.path}) BETWEEN 4 AND 1024`),
    positionCheck: check('agent_context_docs_position_check', sql`${t.position} >= 0`),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.path] }),
    pathIdx: index('skill_context_docs_path_idx').on(t.path),
    pathLenCheck: check('skill_context_docs_path_check', sql`length(${t.path}) BETWEEN 4 AND 1024`),
    positionCheck: check('skill_context_docs_position_check', sql`${t.position} >= 0`),
  }),
);
