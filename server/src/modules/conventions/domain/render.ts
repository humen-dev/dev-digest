import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { SampledFile } from '../types.js';

/** Separator between the line number and the code; the gate strips it back off. */
export const GUTTER_SEPARATOR = '│';

/**
 * Prefix every line with its 1-based number. The gutter is what makes a
 * citation checkable: the model can say "line 42" and code can verify it.
 */
export function renderWithGutter(content: string): string {
  const lines = content.split(/\r?\n/);
  const width = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(width)} ${GUTTER_SEPARATOR} ${line}`)
    .join('\n');
}

/** A path is interpolated into an attribute of the untrusted fence — keep it inert. */
function safeLabel(path: string): string {
  return path.replace(/["<>\r\n]/g, '_');
}

/** One sampled file as an untrusted, line-numbered block. */
export function renderSampleBlock(file: SampledFile): string {
  const header = `path: ${file.path}${file.truncated ? ' (truncated)' : ''}`;
  return wrapUntrusted(`${file.kind}:${safeLabel(file.path)}`, `${header}\n${renderWithGutter(file.content)}`);
}
