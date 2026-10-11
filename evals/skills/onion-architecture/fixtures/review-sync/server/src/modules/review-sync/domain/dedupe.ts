import { createHash } from 'node:crypto';
import type { FindingRow } from '../../../db/rows.js';

type FingerprintInput = Pick<FindingRow, 'file' | 'startLine' | 'title'>;

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').replace(/[`'"]/g, '').trim();
}

export function fingerprint(f: FingerprintInput): string {
  return createHash('sha1')
    .update(`${f.file}:${f.startLine}:${normalizeTitle(f.title)}`)
    .digest('hex')
    .slice(0, 16);
}
