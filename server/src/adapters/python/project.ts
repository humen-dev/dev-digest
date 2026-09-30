/**
 * Python project pass — reads every `.py` file once, scans it, resolves imports
 * to file edges and attributes endpoint/cron facts.
 *
 * Paths are repo-relative POSIX exactly as given by the walk; they are used as
 * keys verbatim and never re-derived with `node:path` `relative`.
 * Never throws: unreadable files land in `degraded`, a passed deadline sets
 * `truncated`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scanPython } from './scan.js';
import {
  buildModuleIndex,
  buildPythonEdges,
  resolveDottedString,
  resolveNameToFile,
} from './imports.js';
import { attributePythonFacts, collectViewInfo, extractPythonRegistrations } from './facts.js';
import type {
  PyFactsResolver,
  PyFileRegistrations,
  PyImport,
  PyOutline,
  PyResolved,
  PyTarget,
  PyViewInfo,
  PythonProjectResult,
} from './types.js';

/** True for a `.py` path (case-insensitive extension). */
export function isPythonFile(path: string): boolean {
  return path.toLowerCase().endsWith('.py');
}

export async function analyzePythonProject(
  root: string,
  files: readonly string[],
  opts: { deadlineAt: number },
): Promise<PythonProjectResult> {
  const result: PythonProjectResult = { edges: [], facts: [], degraded: [], truncated: false };
  try {
    const pyFiles = files.filter(isPythonFile);
    const outlines = new Map<string, PyOutline>();

    for (const f of pyFiles) {
      if (Date.now() > opts.deadlineAt) {
        result.truncated = true;
        break;
      }
      try {
        const source = await readFile(join(root, f), 'utf8');
        outlines.set(f, scanPython(source));
      } catch (err) {
        result.degraded.push({ file: f, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const scanned = [...outlines.keys()];
    const index = buildModuleIndex(scanned);
    const noImports: readonly PyImport[] = [];
    const importsOf = (file: string): readonly PyImport[] => outlines.get(file)?.imports ?? noImports;

    result.edges = buildPythonEdges(index, importsOf);

    const regs: PyFileRegistrations[] = [];
    const viewInfo = new Map<string, Record<string, PyViewInfo>>();
    for (const [file, outline] of outlines) {
      regs.push(extractPythonRegistrations(file, outline));
      viewInfo.set(file, collectViewInfo(outline));
    }

    const resolver: PyFactsResolver = {
      resolveTarget(fromFile: string, target: PyTarget): PyResolved | null {
        if (target.kind === 'local') return { file: fromFile, name: target.name };
        if (target.kind === 'string') return resolveDottedString(index, target.dotted);
        const hit = resolveNameToFile(index, fromFile, target.dotted, importsOf);
        if (hit) return hit;
        const head = target.dotted.split('.')[0] ?? '';
        const outline = outlines.get(fromFile);
        if (
          head &&
          outline &&
          (outline.functions.some((fn) => fn.name === head) ||
            outline.classes.some((c) => c.name === head))
        ) {
          return { file: fromFile, name: head };
        }
        return null;
      },
    };

    result.facts = attributePythonFacts(regs, viewInfo, resolver);
  } catch (err) {
    result.degraded.push({ file: '', reason: err instanceof Error ? err.message : String(err) });
  }
  return result;
}
