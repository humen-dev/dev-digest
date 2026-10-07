/**
 * Ports for the Project Context module (SPEC-01). Plain interfaces only — no
 * Drizzle row types and no adapter imports, so `service.ts` depends on these
 * and never reaches into infrastructure (see the onion-architecture note in
 * `server/AGENTS.md`). The fs adapter lives in `src/adapters/project-docs/`.
 */
import type { ProjectDocStatus } from '@devdigest/shared';

export interface WalkedDoc { path: string /* POSIX, repo-relative */; sizeBytes: number }
export type DocReadResult = { status: 'ok'; text: string } | { status: 'missing' | 'unreadable' | 'unsafe_path' };
export type DocWriteResult = { status: 'ok' } | { status: 'missing' | 'unsafe_path' };
export interface ProjectDocsFs {
  /** Every `.md` file under root, skipping dirs starting with '.', dirs named in excludedDirNames, and paths whose realpath escapes the real root. Stats only — never reads bodies. Sorted by path. */
  walk(cloneRoot: string, excludedDirNames: readonly string[]): Promise<WalkedDoc[]>;
  /** realpath containment check, UTF-8 fatal decode; empty or invalid → 'unreadable'; ENOENT or not a file → 'missing'. Never throws. */
  read(cloneRoot: string, relPath: string): Promise<DocReadResult>;
  /** Overwrites an EXISTING regular file only (never creates); realpath containment check. */
  write(cloneRoot: string, relPath: string, text: string): Promise<DocWriteResult>;
}
export interface DocOwnerRef { id: string; name: string }
export interface LinkedSkillDocs { skillName: string; enabled: boolean; body: string; paths: string[] }
/** One document read for the PR Brief (SPEC-04); structurally the brief module's `BriefDocRead`. */
export interface BriefDocReadResult {
  path: string;
  status: ProjectDocStatus;
  text: string | null;
  tokens: number | null;
}
export interface ProjectContextRepository {
  /** Ids of the workspace's agents with `enabled = true`, in a stable order (created_at, id). */
  listEnabledAgentIds(workspaceId: string): Promise<string[]>;
  getRepoClone(workspaceId: string, repoId: string): Promise<{ id: string; clonePath: string | null } | null>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  skillExists(workspaceId: string, skillId: string): Promise<boolean>;
  getAgentDocs(agentId: string): Promise<string[]>;                 // stored order
  replaceAgentDocs(agentId: string, paths: string[]): Promise<void>; // atomic delete+insert
  getSkillDocs(skillId: string): Promise<string[]>;
  replaceSkillDocs(skillId: string, paths: string[]): Promise<void>;
  linkedSkillDocs(agentId: string): Promise<LinkedSkillDocs[]>;      // agent skill-link order
  agentCountsByPath(workspaceId: string): Promise<Map<string, number>>;
  usageByPath(workspaceId: string, path: string): Promise<{ agents: DocOwnerRef[]; skills: DocOwnerRef[] }>;
}
export interface TokenCounter { count(text: string): number }
