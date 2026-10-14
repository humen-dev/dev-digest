import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readArtifactZip } from '../src/modules/ci/domain/artifact-zip.js';
import { MAX_ARTIFACT_ENTRY_BYTES, RESULT_FILENAME, RUN_META_FILENAME } from '../src/modules/ci/constants.js';

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe('readArtifactZip (NFR-6, UT-5)', () => {
  it('reads both expected files', () => {
    const out = readArtifactZip(zip({ [RESULT_FILENAME]: '{"a":1}', [RUN_META_FILENAME]: '{"b":2}' }));
    expect(out).toEqual({ result: '{"a":1}', meta: '{"b":2}' });
  });

  it('returns only the present file', () => {
    expect(readArtifactZip(zip({ [RUN_META_FILENAME]: '{}' }))).toEqual({ meta: '{}' });
  });

  it('rejects a ../ entry as badEntry', () => {
    expect(readArtifactZip(zip({ '../x': 'boom', [RESULT_FILENAME]: '{}' }))).toEqual({ failure: 'badEntry' });
  });

  it('rejects an absolute entry as badEntry', () => {
    expect(readArtifactZip(zip({ '/etc/passwd': 'x' }))).toEqual({ failure: 'badEntry' });
  });

  it('rejects an unexpected extra entry as badEntry', () => {
    expect(readArtifactZip(zip({ [RESULT_FILENAME]: '{}', 'extra.txt': 'x' }))).toEqual({ failure: 'badEntry' });
  });

  it('rejects more than 64 entries as badEntry', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 65; i++) files[`f${i}.json`] = '{}';
    expect(readArtifactZip(zip(files))).toEqual({ failure: 'badEntry' });
  });

  it('rejects an oversize entry as tooLarge (compressed bomb)', () => {
    const big = 'a'.repeat(MAX_ARTIFACT_ENTRY_BYTES + 1);
    const bytes = zip({ [RESULT_FILENAME]: big });
    expect(bytes.length).toBeLessThan(10_000); // highly compressible
    expect(readArtifactZip(bytes)).toEqual({ failure: 'tooLarge' });
  });

  it('treats corrupt bytes as badEntry', () => {
    expect(readArtifactZip(new Uint8Array([1, 2, 3, 4]))).toEqual({ failure: 'badEntry' });
  });
});
