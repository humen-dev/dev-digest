import { createHash } from 'node:crypto';

/** First 12 hex characters of the workflow text's sha256 (matches `CiPreview.workflow_version`). */
export function workflowVersion(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
