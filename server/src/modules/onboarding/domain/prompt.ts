import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { InputFile, PromptInput } from '../types.js';

/**
 * Renders a `PromptInput` into the two-message request sent to the LLM (U5
 * wires the system template in; this module never calls a provider itself).
 * A path is interpolated into the tree text and into the `source` attribute
 * of an untrusted fence — kept inert the same way
 * `modules/conventions/domain/render.ts` does for sampled files.
 */

/** Neutralizes `"`, `<`, `>`, CR and LF so a path can't break out of its context (UT-3). */
export function escapePathLabel(path: string): string {
  return path.replace(/["<>\r\n]/g, '_');
}

function renderFile(file: InputFile): string {
  return wrapUntrusted(escapePathLabel(file.path), file.text);
}

/**
 * System = the template text, verbatim. User message = the escaped file
 * tree, then each excerpt as an untrusted block, then each command source
 * file as an untrusted block (AC-40 order).
 */
export function buildMessages(systemPrompt: string, input: PromptInput): ChatMessage[] {
  const parts: string[] = [
    `Repository: ${input.repoName}`,
    `## File tree (${input.tree.length})\n${input.tree.map((path) => escapePathLabel(path)).join('\n')}`,
  ];

  if (input.excerpts.length > 0) {
    parts.push(`## Key file excerpts (${input.excerpts.length})`);
    for (const file of input.excerpts) parts.push(renderFile(file));
  }

  if (input.commandFiles.length > 0) {
    parts.push(`## Command source files (${input.commandFiles.length})`);
    for (const file of input.commandFiles) parts.push(renderFile(file));
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: parts.join('\n\n') },
  ];
}
