/**
 * Per-file parse dispatcher shared by the full and incremental pipelines.
 * `.py` goes through the Python adapter (no endpoint/cron extraction — those
 * facts come from the project pass); everything else keeps the ast-grep +
 * regex path unchanged.
 */
import { parseSymbols, parseReferences, langForFile } from '../../../adapters/astgrep/index.js';
import { extractEndpoints, extractCrons } from '../../../adapters/codeindex/extract.js';
import {
  isPythonFile,
  parsePythonReferences,
  parsePythonSymbols,
} from '../../../adapters/python/index.js';
import { MAX_SIGNATURE_CHARS } from '../constants.js';

export interface ParsedSourceFile {
  symbols: Array<{
    name: string;
    kind: string;
    line: number;
    endLine: number;
    exported: boolean;
    signature: string | null;
  }>;
  references: Array<{ toSymbol: string; line: number }>;
  endpoints: string[];
  crons: string[];
}

/** True when a file is parsed by either the JS/TS or the Python path. */
export function isIndexable(relPath: string): boolean {
  return langForFile(relPath) !== null || isPythonFile(relPath);
}

export function parseSourceFile(relPath: string, source: string): ParsedSourceFile {
  if (isPythonFile(relPath)) {
    return {
      symbols: parsePythonSymbols(relPath, source, MAX_SIGNATURE_CHARS),
      references: parsePythonReferences(relPath, source),
      endpoints: [],
      crons: [],
    };
  }
  return {
    symbols: parseSymbols(relPath, source),
    references: parseReferences(relPath, source),
    endpoints: extractEndpoints(source),
    crons: extractCrons(source),
  };
}
