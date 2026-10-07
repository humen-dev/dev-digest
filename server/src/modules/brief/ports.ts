import type { BlastRadiusResponse, SmartDiffResponse, FeatureModelChoice, LLMProvider, ProjectDocStatus, PrBriefRecord } from '@devdigest/shared';
export interface BriefPull { id: string; workspaceId: string; repoId: string; number: number; title: string; body: string | null; headSha: string; repo: { owner: string; name: string; clonePath: string | null } }
export interface BriefPrFile { path: string; additions: number; deletions: number; patch: string | null }
export interface BriefIntentRow { intent: string; inScope: string[]; outOfScope: string[]; headSha: string }
export interface BriefRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<BriefPull | null>;
  listPrFiles(prId: string): Promise<BriefPrFile[]>;
  getIntent(prId: string): Promise<BriefIntentRow | null>;
  getStored(prId: string): Promise<unknown | null>;            // raw json; service validates
  upsert(prId: string, record: PrBriefRecord): Promise<void>;  // replace on conflict
}
export interface BriefDocRead { path: string; status: ProjectDocStatus; text: string | null; tokens: number | null }
export interface BriefContextDocsPort {
  attachedPaths(workspaceId: string): Promise<string[]>;
  listProjectDocs(workspaceId: string, repoId: string): Promise<{ cloned: boolean; documents: { path: string; estimated_tokens: number }[] }>;
  readDocs(clonePath: string | null, paths: string[]): Promise<BriefDocRead[]>;
}
export interface BriefIssuePort { getIssue(repo: { owner: string; name: string }, n: number): Promise<{ title: string; body: string | null }> }
export interface OpsLogger { info(obj: object, msg?: string): void; warn(obj: object, msg?: string): void }
export interface BriefDeps {
  briefs: BriefRepositoryPort;
  blast: (workspaceId: string, prId: string) => Promise<BlastRadiusResponse>;
  smartDiff: (workspaceId: string, prId: string) => Promise<SmartDiffResponse>;
  github: () => Promise<BriefIssuePort>;
  contextDocs: BriefContextDocsPort;
  llm: (provider: FeatureModelChoice['provider']) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  tokenizer: { count(text: string): number };
  loadSystemPrompt: () => Promise<string>;
  deadlineMs: number;
  now?: () => number;
}
