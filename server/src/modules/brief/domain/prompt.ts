import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { BriefFileFact, BriefInput } from '../types.js';

/**
 * Renders a `BriefInput` into the two-message request sent to the LLM. The
 * system message is the template verbatim (it carries its own injection
 * guard); every attacker-influenced item goes into the user message inside an
 * untrusted fence (UT-1, UT-3, UT-5, UT-8, UT-9).
 */

/** Neutralizes `"`, `<`, `>`, CR and LF so a label/path can't break out of its context. */
function clean(text: string): string {
  return text.replace(/["<>\r\n]/g, '_');
}

function renderFile(f: BriefFileFact): string {
  const hunks = f.hunks.map(([s, e]) => `${s}-${e}`).join(',');
  const role = f.role ? ` role=${f.role}` : '';
  return `${clean(f.path)} +${f.additions} -${f.deletions}${role}${hunks ? ` hunks=${hunks}` : ''}`;
}

export function buildBriefMessages(system: string, input: BriefInput): ChatMessage[] {
  const parts: string[] = [];

  parts.push(`## Pull request\n${wrapUntrusted('pr-title', input.pr.title)}`);
  parts.push(wrapUntrusted('pr-body', input.pr.body));

  const { files, additions, deletions } = input.totals;
  parts.push(
    `## Changed files (${files} files, +${additions} -${deletions}; showing ${input.files.length})\n` +
      wrapUntrusted('changed-files', input.files.map(renderFile).join('\n')),
  );

  if (input.intent) {
    const lines = [
      input.intent.intent,
      ...(input.intent.in_scope.length ? ['In scope:', ...input.intent.in_scope.map((s) => `- ${s}`)] : []),
      ...(input.intent.out_of_scope.length ? ['Out of scope:', ...input.intent.out_of_scope.map((s) => `- ${s}`)] : []),
    ];
    parts.push(`## Detected intent\n${wrapUntrusted('intent', lines.join('\n'))}`);
  }

  if (input.blast) {
    const b = input.blast;
    const lines = [
      b.summary,
      ...(b.callers.length ? ['Callers:', ...b.callers.map((c) => `- ${c.symbol} <- ${c.name} at ${clean(c.file)}:${c.line}`)] : []),
      ...(b.endpoints.length ? ['Endpoints:', ...b.endpoints.map((e) => `- ${e}`)] : []),
      ...(b.crons.length ? ['Crons:', ...b.crons.map((c) => `- ${c}`)] : []),
    ];
    parts.push(`## Blast radius\n${wrapUntrusted('blast-radius', lines.join('\n'))}`);
  }

  if (input.issue) {
    const text = `#${input.issue.number} ${input.issue.title}${input.issue.body ? `\n\n${input.issue.body}` : ''}`;
    parts.push(`## Linked issue\n${wrapUntrusted('linked-issue', text)}`);
  }

  if (input.docs.length > 0) {
    parts.push(`## Project context documents (${input.docs.length})`);
    for (const d of input.docs) parts.push(wrapUntrusted(clean(d.path), d.text));
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ];
}
