import type { IntentRepository } from '../intent/index.js';
import { toPrIntentRecord } from '../intent/index.js';
import type { SkillsService } from '../skills/index.js';
import { MAX_PULLS_IN_DIGEST } from './constants.js';
import { buildDigest, type DigestInput } from './domain/build-digest.js';
import type { PrDigestRepositoryPort } from './ports.js';
import type { DigestQuery, PrDigest } from './types.js';

export interface PrDigestDeps {
  repo: PrDigestRepositoryPort;
  intents: IntentRepository;
  skills: SkillsService;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class PrDigestService {
  constructor(private readonly deps: PrDigestDeps) {}

  async build(workspaceId: string, repoId: string, query: DigestQuery): Promise<PrDigest> {
    const now = this.deps.now?.() ?? new Date();
    const since = new Date(now.getTime() - query.days * DAY_MS);

    const pulls = await this.deps.repo.listUpdatedSince(workspaceId, repoId, since, MAX_PULLS_IN_DIGEST);

    const inputs: DigestInput[] = await Promise.all(
      pulls.map(async (p) => {
        const intentRow = await this.deps.intents.get(p.id);
        return {
          prId: p.id,
          number: p.number,
          title: p.title,
          author: p.author,
          intent: intentRow ? toPrIntentRecord(intentRow).intent : null,
          files: p.files,
        };
      }),
    );

    const skills = await this.deps.skills.list(workspaceId);
    const activeSkills = skills.filter((s) => s.enabled).map((s) => s.name);

    return buildDigest(repoId, since, inputs, activeSkills);
  }
}
