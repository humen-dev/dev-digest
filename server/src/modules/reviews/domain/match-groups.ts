import type { AgentRunStatus, Conflict, ConflictTake, Severity } from '@devdigest/shared';

/**
 * SPEC-07 — pure match-group computation for a multi-agent run. No I/O, no LLM,
 * no filesystem: a file path is just a string key (`../../etc/passwd` groups by
 * string, UT-7). Output is independent of input finding order (NFR-5).
 */

export interface GroupInputFinding {
  id: string;
  severity: Severity;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
}

export interface GroupInputRun {
  runId: string;
  agentId: string | null;
  agentName: string;
  agentDescription: string;
  status: AgentRunStatus;
  findings: GroupInputFinding[];
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** Inclusive range with start <= end (tolerates a reversed pair). */
function range(f: GroupInputFinding): [number, number] {
  return f.startLine <= f.endLine ? [f.startLine, f.endLine] : [f.endLine, f.startLine];
}

/** Higher severity first; ties by lowest start line, then id. */
function compareTop(a: GroupInputFinding, b: GroupInputFinding): number {
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  const start = range(a)[0] - range(b)[0];
  if (start !== 0) return start;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function topFinding(findings: GroupInputFinding[]): GroupInputFinding {
  return [...findings].sort(compareTop)[0]!;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Group findings of `done` runs: same file string and inclusive line-range
 * overlap (directly or transitively, union-find). Returns every group, sorted by
 * file then line; `takes` hold one entry per run in the given run order.
 */
export function buildMatchGroups(runs: GroupInputRun[]): Conflict[] {
  type Entry = { finding: GroupInputFinding; runId: string };
  const entries: Entry[] = [];
  for (const run of runs) {
    if (run.status !== 'done') continue;
    for (const finding of run.findings) entries.push({ finding, runId: run.runId });
  }

  // Union-find over entries; overlap is checked per file only.
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const byFile = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const list = byFile.get(e.finding.file);
    if (list) list.push(i);
    else byFile.set(e.finding.file, [i]);
  });
  for (const indices of byFile.values()) {
    for (let a = 0; a < indices.length; a++) {
      const [aStart, aEnd] = range(entries[indices[a]!]!.finding);
      for (let b = a + 1; b < indices.length; b++) {
        const [bStart, bEnd] = range(entries[indices[b]!]!.finding);
        if (aStart <= bEnd && bStart <= aEnd) {
          const ra = find(indices[a]!);
          const rb = find(indices[b]!);
          if (ra !== rb) parent[ra] = rb;
        }
      }
    }
  }

  const members = new Map<number, Entry[]>();
  entries.forEach((e, i) => {
    const root = find(i);
    const list = members.get(root);
    if (list) list.push(e);
    else members.set(root, [e]);
  });

  const groups: Conflict[] = [];
  for (const group of members.values()) {
    const findings = group.map((g) => g.finding);
    const top = topFinding(findings);
    const file = top.file;
    const line = Math.min(...findings.map((f) => range(f)[0]));

    const takes: ConflictTake[] = runs.map((run) => {
      const base = { run_id: run.runId, agent_id: run.agentId, persona: run.agentName, run_status: run.status };
      if (run.status !== 'done') return { ...base, verdict: 'ignored' as const, note: '' };
      const own = group.filter((g) => g.runId === run.runId).map((g) => g.finding);
      if (own.length === 0) return { ...base, verdict: 'ignored' as const, note: run.agentDescription };
      const best = topFinding(own);
      return { ...base, verdict: best.severity, note: best.title };
    });

    const doneTakes = takes.filter((t) => t.run_status === 'done');
    const severities = new Set(doneTakes.filter((t) => t.verdict !== 'ignored').map((t) => t.verdict));
    const isConflict = doneTakes.some((t) => t.verdict === 'ignored') || severities.size > 1;

    groups.push({
      id: `${file}#${line}`,
      file,
      line,
      title: top.title,
      is_conflict: isConflict,
      finding_ids: [...findings]
        .sort((a, b) => range(a)[0] - range(b)[0] || compareStrings(a.id, b.id))
        .map((f) => f.id),
      takes,
    });
  }

  return groups.sort((a, b) => compareStrings(a.file, b.file) || a.line - b.line);
}
