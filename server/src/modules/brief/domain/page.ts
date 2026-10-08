import { PrBriefRecord, type BriefPage } from '@devdigest/shared';

/** Validates a stored JSON blob; anything that is not a full record is treated as absent. */
export function parseStoredRecord(json: unknown): PrBriefRecord | null {
  const parsed = PrBriefRecord.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function buildPage(a: { record: PrBriefRecord | null; headSha: string; generating: boolean }): BriefPage {
  const { record, headSha, generating } = a;
  const base = {
    reason: null,
    brief: record?.brief ?? null,
    provenance: record?.provenance ?? null,
    current_head_sha: headSha,
  };
  if (generating) return { ...base, status: 'generating' };
  if (!record) return { ...base, status: 'none' };
  return { ...base, status: record.provenance.head_sha === headSha ? 'generated' : 'outdated' };
}

/** A refused/failed generation: keeps any previously stored brief visible alongside the reason. */
export function outcomePage(
  status: 'refused' | 'failed',
  reason: string,
  record: PrBriefRecord | null,
  headSha: string,
): BriefPage {
  return {
    status,
    reason,
    brief: record?.brief ?? null,
    provenance: record?.provenance ?? null,
    current_head_sha: headSha,
  };
}
