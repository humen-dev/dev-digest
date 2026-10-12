import { createHash } from 'node:crypto';
import type { CiFile, CiFailOn, ReviewStrategy } from '@devdigest/shared';
import { hasInjection } from '../../_shared/injection.js';
import { MEMORY_PATH, RUNNER_DIR, WORKFLOW_PATH, agentManifestPath, skillFilePath } from '../constants.js';
import { buildAgentManifest, renderManifestYaml } from './manifest.js';
import { renderMemoryJsonl, type MemoryExportRow } from './memory-jsonl.js';
import { containsKnownSecretValue, containsSecretShapedValue } from './secret-scan.js';
import { agentSlug } from './slug.js';

/**
 * SPEC-07 AC-8 / AC-10 / AC-42 / AC-86 — assemble every file the export will
 * write. Pure: the caller loads the agent, skills, memory and runner bundle.
 */

export interface FileSetAgent {
  name: string;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
}

export interface FileSetInput {
  agent: FileSetAgent;
  /** Linked skills in the agent's order. */
  skills: readonly { name: string; body: string; enabled: boolean }[];
  memoryRows: readonly MemoryExportRow[];
  /** The workflow text to ship (generated or user-edited). */
  workflow: string;
  runnerFiles: readonly { relPath: string; contents: string }[];
  /** Stored slug on a re-export, `agentSlug(name)` on a first export (AC-86). */
  manifestSlug: string;
  /** Every non-empty workspace secret value (AC-42). */
  knownSecretValues: readonly string[];
}

export type FileSetResult = { files: CiFile[]; warnings: string[] } | { credentialPath: string };

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

function toFile(path: string, kind: CiFile['kind'], contents: string, editable = false): CiFile {
  return { path, kind, contents, bytes: Buffer.byteLength(contents, 'utf8'), sha256: sha256(contents), editable };
}

/** Distinct skill slugs; a collision gets a numeric suffix so no file is overwritten. */
function uniqueSlug(name: string, taken: Set<string>): string {
  const base = agentSlug(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function assembleFileSet(input: FileSetInput): FileSetResult {
  const warnings: string[] = [];
  const takenSlugs = new Set<string>();
  const skillFiles: CiFile[] = [];
  const skillSlugs: string[] = [];

  for (const skill of input.skills) {
    if (!skill.enabled) {
      warnings.push(`Skill "${skill.name}" is disabled and was not exported`);
      continue;
    }
    if (hasInjection(skill.body)) {
      warnings.push(`Skill "${skill.name}" contains prompt-injection patterns and was not exported`);
      continue;
    }
    const slug = uniqueSlug(skill.name, takenSlugs);
    skillSlugs.push(slug);
    skillFiles.push(toFile(skillFilePath(slug), 'skill', skill.body));
  }

  const manifest = buildAgentManifest({ ...input.agent, skillSlugs });

  const files: CiFile[] = [
    toFile(agentManifestPath(input.manifestSlug), 'manifest', renderManifestYaml(manifest)),
    ...skillFiles,
    toFile(MEMORY_PATH, 'memory', renderMemoryJsonl(input.memoryRows)),
    toFile(WORKFLOW_PATH, 'workflow', input.workflow, true),
    ...input.runnerFiles.map((f) => toFile(`${RUNNER_DIR}/${f.relPath}`, 'runner', f.contents)),
  ];

  for (const file of files) {
    const text = file.contents ?? '';
    if (containsSecretShapedValue(text) || containsKnownSecretValue(text, input.knownSecretValues)) {
      return { credentialPath: file.path };
    }
  }
  return { files, warnings };
}
