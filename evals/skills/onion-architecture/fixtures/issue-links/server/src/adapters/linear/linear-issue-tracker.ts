import { LinearClient, type Issue } from '@linear/sdk';
import { extractIssueKeys } from '../../modules/issue-links/service.js';
import type { IssueTrackerPort } from '../../modules/issue-links/ports.js';

export class LinearIssueTracker implements IssueTrackerPort {
  private readonly client: LinearClient;

  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
  }

  async getIssue(key: string): Promise<Issue | null> {
    const [normalized] = extractIssueKeys(key);
    if (!normalized) return null;
    try {
      return await this.client.issue(normalized);
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) return null;
      throw err;
    }
  }
}
