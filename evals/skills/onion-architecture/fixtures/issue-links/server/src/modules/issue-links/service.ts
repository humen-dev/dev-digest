import type { Issue } from '@linear/sdk';
import { NotFoundError } from '../../platform/errors.js';
import type { IssueTrackerPort, PullTextSource } from './ports.js';
import type { LinkedIssue, PullIssueLinks } from './types.js';

const ISSUE_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;
const MAX_KEYS = 10;

export function extractIssueKeys(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(ISSUE_KEY)) {
      seen.add(m[1]!.toUpperCase());
      if (seen.size >= MAX_KEYS) return [...seen];
    }
  }
  return [...seen];
}

export interface IssueLinksDeps {
  tracker: IssueTrackerPort;
  pulls: PullTextSource;
}

export class IssueLinksService {
  constructor(private readonly deps: IssueLinksDeps) {}

  async forPull(workspaceId: string, pullId: string): Promise<PullIssueLinks> {
    const pull = await this.deps.pulls.getPullText(workspaceId, pullId);
    if (!pull) throw new NotFoundError('pull', pullId);

    const keys = extractIssueKeys(pull.branch, pull.title, pull.body);
    const issues: LinkedIssue[] = [];
    const unresolved: string[] = [];
    for (const key of keys) {
      const issue = await this.deps.tracker.getIssue(key);
      if (issue) issues.push(await toLinkedIssue(issue));
      else unresolved.push(key);
    }
    return { pullId, issues, unresolved };
  }
}

async function toLinkedIssue(issue: Issue): Promise<LinkedIssue> {
  const [state, assignee] = await Promise.all([issue.state, issue.assignee]);
  return {
    key: issue.identifier,
    title: issue.title,
    state: state?.name ?? 'unknown',
    url: issue.url,
    assignee: assignee?.displayName ?? null,
  };
}
