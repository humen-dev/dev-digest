import type { ConventionStatus, Skill } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import { DEFAULT_SKILL_TYPE } from '../skills/constants.js';
import { REPLACEMENT_SUFFIX } from './constants.js';
import { extractIssueRefs, missingEvidence, staleIssueRefs } from './domain/find-stale-refs.js';
import type { SkillAuditRepositoryPort, SkillCatalogPort, SkillDraftSink } from './ports.js';
import type { AuditFinding, AuditReport, NewFinding } from './types.js';

export interface SkillAuditDeps {
  repo: SkillAuditRepositoryPort;
  catalog: SkillCatalogPort;
  drafts: SkillDraftSink;
  repoIntel: () => Promise<RepoIntel>;
  openIssueNumbers: (workspaceId: string, repoId: string) => Promise<Set<number>>;
}

export class SkillAuditService {
  constructor(private readonly deps: SkillAuditDeps) {}

  list(workspaceId: string, repoId: string): Promise<AuditFinding[]> {
    return this.deps.repo.listByRepo(workspaceId, repoId);
  }

  async run(workspaceId: string, repoId: string): Promise<AuditReport> {
    const skills = await this.deps.catalog.listEnabled(workspaceId);
    const open = await this.deps.openIssueNumbers(workspaceId, repoId);
    const intel = await this.deps.repoIntel();

    const found: NewFinding[] = [];
    for (const skill of skills) {
      for (const ref of staleIssueRefs(extractIssueRefs(skill.body), open)) {
        found.push({ skillId: skill.id, kind: 'stale_issue', ref });
      }
      const evidence = skill.evidence_files ?? [];
      if (evidence.length > 0) {
        const ranked = await intel.getFileRank(repoId, evidence);
        for (const path of missingEvidence(evidence, ranked)) {
          found.push({ skillId: skill.id, kind: 'missing_file', ref: path });
        }
      }
    }

    await this.deps.repo.upsertPending(workspaceId, repoId, found);
    const findings = await this.deps.repo.listByRepo(workspaceId, repoId);
    return { repoId, scannedSkills: skills.length, findings };
  }

  async decide(workspaceId: string, ids: string[], status: ConventionStatus): Promise<AuditFinding[]> {
    const updated = await this.deps.repo.setStatus(workspaceId, ids, status);
    if (status === 'accepted') await this.draftReplacements(workspaceId, updated);
    return updated;
  }

  private async draftReplacements(workspaceId: string, accepted: AuditFinding[]): Promise<Skill[]> {
    const bySkill = new Map<string, AuditFinding[]>();
    for (const f of accepted) bySkill.set(f.skillId, [...(bySkill.get(f.skillId) ?? []), f]);

    const skills = await this.deps.catalog.listEnabled(workspaceId);
    const drafts: Skill[] = [];
    for (const skill of skills) {
      const fs = bySkill.get(skill.id);
      if (!fs) continue;
      const stale = new Set(fs.map((f) => f.ref));
      drafts.push(
        await this.deps.drafts.create({
          workspaceId,
          name: `${skill.name}${REPLACEMENT_SUFFIX}`,
          description: skill.description,
          type: skill.type ?? DEFAULT_SKILL_TYPE,
          body: skill.body,
          enabled: false,
          evidenceFiles: (skill.evidence_files ?? []).filter((p) => !stale.has(p)),
        }),
      );
    }
    return drafts;
  }
}
