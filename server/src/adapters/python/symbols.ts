/**
 * Python symbols and references (docs/plans/repo-intel-python.md §3.2, U3).
 * Pure functions over `scanPython`; output rows are shaped like the indexer's
 * symbol / reference rows (`name, kind, line, endLine, exported, signature` / `toSymbol, line`).
 */

import { scanPython } from './scan.js';
import type { PyOutline, PyReference, PySymbol } from './types.js';

export const PY_KEYWORDS: ReadonlySet<string> = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield', 'match', 'case',
]);

export const PY_BUILTINS: ReadonlySet<string> = new Set([
  'self', 'cls', 'print', 'len', 'str', 'int', 'float', 'bool', 'dict', 'list', 'set',
  'tuple', 'type', 'object', 'super', 'isinstance', 'issubclass', 'range', 'enumerate',
  'zip', 'map', 'filter', 'sorted', 'reversed', 'min', 'max', 'sum', 'any', 'all', 'open',
  'getattr', 'setattr', 'hasattr', 'delattr', 'repr', 'hash', 'id', 'iter', 'next', 'vars',
  'dir', 'callable', 'format', 'round', 'abs', 'divmod', 'pow', 'input', 'exec', 'eval',
  'compile', 'globals', 'locals', 'staticmethod', 'classmethod', 'property', 'Exception',
  'BaseException', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'AttributeError',
  'RuntimeError', 'NotImplementedError', 'StopIteration', 'ImportError', 'OSError',
  'None', 'True', 'False',
]);

function trimSignature(sig: string, max: number): string {
  return sig.length > max ? `${sig.slice(0, Math.max(0, max - 1))}…` : sig;
}

function symbolsFromOutline(outline: PyOutline, maxSignatureChars: number): PySymbol[] {
  const out: PySymbol[] = [];
  const seen = new Set<string>();
  const push = (s: PySymbol): void => {
    const key = `${s.name}:${s.kind}:${s.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const fn of outline.functions) {
    push({
      name: fn.name,
      kind: 'function',
      line: fn.line,
      endLine: fn.endLine,
      exported: true,
      signature: trimSignature(fn.signature, maxSignatureChars),
    });
  }
  for (const cls of outline.classes) {
    push({
      name: cls.name,
      kind: 'class',
      line: cls.line,
      endLine: cls.endLine,
      exported: true,
      signature: trimSignature(cls.signature, maxSignatureChars),
    });
    for (const m of cls.methods) {
      const signature = trimSignature(m.signature, maxSignatureChars);
      for (const name of [`${cls.name}.${m.name}`, m.name]) {
        push({ name, kind: 'method', line: m.line, endLine: m.endLine, exported: true, signature });
      }
    }
  }
  return out;
}

export function parsePythonSymbols(
  _file: string,
  source: string,
  maxSignatureChars: number,
): PySymbol[] {
  return symbolsFromOutline(scanPython(source), maxSignatureChars);
}

export function parsePythonReferences(_file: string, source: string): PyReference[] {
  const outline = scanPython(source);

  const fromBound = new Map<string, string>();
  const moduleBound = new Set<string>();
  for (const imp of outline.imports) {
    if (imp.kind === 'from') {
      for (const n of imp.names) fromBound.set(n.alias ?? n.name, n.name);
    } else if (imp.alias) {
      moduleBound.add(imp.alias);
    } else {
      moduleBound.add(imp.module.split('.')[0] ?? imp.module);
    }
  }

  const declared = new Set(symbolsFromOutline(outline, 0).map((s) => `${s.name}\u0000${s.line}`));
  const out: PyReference[] = [];
  const seen = new Set<string>();

  for (const use of outline.nameUses) {
    const candidates: string[] = [];
    const parts = use.dotted.split('.');
    const head = parts[0] ?? '';
    if (parts.length === 1) {
      const bound = fromBound.get(head);
      if (bound !== undefined) candidates.push(bound);
      else if (use.isCall) candidates.push(head);
    } else {
      const s1 = parts[1] ?? '';
      const bound = fromBound.get(head);
      if (bound !== undefined) candidates.push(bound, s1);
      else if (moduleBound.has(head)) candidates.push(s1);
      if (use.isCall) candidates.push(parts[parts.length - 1] ?? '');
    }
    for (const name of candidates) {
      if (!name || PY_KEYWORDS.has(name) || PY_BUILTINS.has(name)) continue;
      if (declared.has(`${name}\u0000${use.line}`)) continue;
      const key = `${name}\u0000${use.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ toSymbol: name, line: use.line });
    }
  }
  return out;
}
