import type { CiRunsQuery } from "@devdigest/shared";
import {
  ALL_TIME_FROM,
  DAY_MS,
  DEFAULT_FILTERS,
  GITHUB_URL_PREFIX,
  RANGE_DAYS,
  RANGE_ORDER,
  REPO_RE,
  SOURCE_ORDER,
  STATUS_ORDER,
  UUID_RE,
} from "./constants";
import type { CiRunsFilterState, CiRunsRange } from "./types";

function oneOf<T extends string>(values: readonly T[], v: string | null): T | null {
  return v !== null && (values as readonly string[]).includes(v) ? (v as T) : null;
}

/** Read the filters from the URL; anything unrecognised falls back to "no filter". */
export function parseFilters(search: { get(name: string): string | null }): CiRunsFilterState {
  const agent = search.get("agent") ?? "";
  const repo = search.get("repo") ?? "";
  return {
    range: oneOf<CiRunsRange>(RANGE_ORDER, search.get("range")) ?? DEFAULT_FILTERS.range,
    agent: UUID_RE.test(agent) ? agent : "",
    repo: REPO_RE.test(repo) ? repo : "",
    status: oneOf(STATUS_ORDER, search.get("status")) ?? "",
    source: oneOf(SOURCE_ORDER, search.get("source")) ?? "",
  };
}

/** Serialise non-default filters to a query string (no leading "?"). */
export function filtersToSearch(f: CiRunsFilterState): string {
  const p = new URLSearchParams();
  if (f.range !== DEFAULT_FILTERS.range) p.set("range", f.range);
  if (f.agent) p.set("agent", f.agent);
  if (f.repo) p.set("repo", f.repo);
  if (f.status) p.set("status", f.status);
  if (f.source) p.set("source", f.source);
  return p.toString();
}

/** Map the page filters onto the `GET /ci/runs` query. */
export function buildRunsQuery(f: CiRunsFilterState, now: Date): Partial<CiRunsQuery> {
  const days = RANGE_DAYS[f.range];
  const query: Partial<CiRunsQuery> = {
    from: days === null ? ALL_TIME_FROM : new Date(now.getTime() - days * DAY_MS).toISOString(),
  };
  if (f.agent) query.agent_id = f.agent;
  if (f.repo) query.repo = f.repo;
  const status = oneOf(STATUS_ORDER, f.status);
  if (status) query.status = status;
  const source = oneOf(SOURCE_ORDER, f.source);
  if (source) query.source = source;
  return query;
}

/** A URL is linkable only when it is an https://github.com/ URL (blocks javascript:, lookalike hosts). */
export function safeGithubUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(GITHUB_URL_PREFIX)) return null;
  try {
    return new URL(url).hostname === "github.com" ? url : null;
  } catch {
    return null;
  }
}
