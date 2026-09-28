// src/domain/types.ts — ring 1: plain data shapes. No imports, no I/O.

// API data (what the port returns) —
export interface ApiRepo { id: string; owner: string; name: string; full_name: string }
export interface ApiPull { id: string; number: number; title: string; status: string }
export interface ApiAgent { id: string; name: string; description: string; provider: string; model: string; enabled: boolean; ci_fail_on: string }
export interface ApiStartedRun { run_id: string; agent_id: string; agent_name: string }
export interface ApiRun { run_id: string; agent_id: string | null; agent_name: string | null; status: string | null; error: string | null; score: number | null; blockers: number | null; findings_count: number | null; ran_at: string | null }
export interface ApiActiveRun { run_id: string; agent_id: string | null; agent_name: string | null }
export type ApiSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export interface ApiFinding { id: string; severity: ApiSeverity; category: string; title: string; file: string; start_line: number; end_line: number; rationale: string; confidence: number; dismissed_at: string | null }
export interface ApiReview { id: string; run_id: string | null; agent_id: string | null; agent_name: string | null; kind: 'summary' | 'review'; verdict: string | null; summary: string | null; score: number | null; created_at: string; findings: ApiFinding[] }
export interface ApiConvention { id: string; rule: string; category: string; status: 'pending' | 'accepted' | 'rejected'; evidence_path: string; evidence_line: number; occurrences: number | null; confidence: number }
export interface ApiConventionBoard { candidates: ApiConvention[]; last_scan: { created_at: string } | null }

// Compact tool results (what the agent receives) —
export interface CompactFinding { loc: string; severity: ApiSeverity; category: string; title: string; message: string }
export interface ReviewResult {
  status: 'done';
  repo: string; pr: number; run_id: string | null; agent: string | null;
  attached?: true; // run_agent_on_pr only
  verdict: string | null; score: number | null;
  blockers: number | null; gate: 'block' | 'pass' | null;
  summary: string; // clipped ≤300
  counts: { critical: number; warning: number; suggestion: number }; // non-dismissed, before filter/limit
  findings: CompactFinding[];
  truncated?: string; // e.g. 'Showing 20 of 34 findings; pass limit (max 100) or min_severity to change.'
}
export interface RunningResult { status: 'running'; repo: string; pr: number; run_id: string; agent: string | null; elapsed_s: number; next: string }
export interface CompactAgent { id: string; name: string; description: string; model: string; enabled: boolean; ci_fail_on: string }
export interface AgentsResult { agents: CompactAgent[]; next: string }
export interface CompactConvention { rule: string; category: string; evidence: string; occurrences: number | null }
export interface ConventionsResult {
  repo: string; status: 'accepted' | 'pending' | 'all'; category: string | null;
  total_matching: number; returned: number; last_scan_at: string | null;
  conventions: CompactConvention[]; note?: string; truncated?: string;
}
