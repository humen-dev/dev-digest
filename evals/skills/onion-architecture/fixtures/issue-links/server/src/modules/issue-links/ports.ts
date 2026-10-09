import type { Issue } from '@linear/sdk';

export interface IssueTrackerPort {
  getIssue(key: string): Promise<Issue | null>;
}

export interface PullTextSource {
  getPullText(workspaceId: string, pullId: string): Promise<{ title: string; body: string; branch: string } | null>;
}
