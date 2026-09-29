/**
 * Per-file parse dispatcher shared by the full and incremental pipelines.
 * `.py` goes through the Python adapter (no endpoint/cron extraction — those
 * facts come from the project pass); everything else keeps the ast-grep +
 * regex path unchanged.
 */
import { parseSymbols, parseReferences, langForFile } from '../../../adapters/astgrep/index.js';
import {
  extractEndpointFacts,
  extractCronFacts,
  foldFactHandlers,
} from '../../../adapters/codeindex/extract.js';
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
  /** fact string → handler names; a fact with no key has an unknown handler. */
  endpointHandlers: Record<string, string[]>;
  cronHandlers: Record<string, string[]>;
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
      endpointHandlers: {},
      cronHandlers: {},
    };
  }
  const endpoints = foldFactHandlers(extractEndpointFacts(source));
  const crons = foldFactHandlers(extractCronFacts(source));
  return {
    symbols: parseSymbols(relPath, source),
    references: parseReferences(relPath, source),
    endpoints: endpoints.facts,
    crons: crons.facts,
    endpointHandlers: endpoints.handlers,
    cronHandlers: crons.handlers,
  };
}
