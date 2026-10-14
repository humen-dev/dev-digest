import type { CiExportInputBody, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ALL_TRIGGERS, REASON_PROVIDER_NOT_SUPPORTED, REPO_FULL_NAME_RE } from "./constants";

export function isRepoValid(repo: string): boolean {
  return REPO_FULL_NAME_RE.test(repo.trim());
}

/**
 * Repo picker options — the workspace's imported repos (`owner/name`), sorted.
 * A pre-filled repo that is not imported (e.g. "Update CI config" on an older
 * installation) is kept as an option so the picker still shows it.
 */
export function repoOptions(repos: readonly { full_name: string }[], current: string): string[] {
  const names = new Set(repos.map((r) => r.full_name));
  const value = current.trim();
  if (value) names.add(value);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Add or remove one trigger, keeping the canonical order. */
export function toggleTrigger(current: CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  const next = current.includes(trigger) ? current.filter((x) => x !== trigger) : [...current, trigger];
  return ALL_TRIGGERS.filter((x) => next.includes(x));
}

export function buildInput(i: {
  repo: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  workflow: string | null;
}): CiExportInputBody {
  return {
    repo: i.repo.trim(),
    target: "gha",
    post_as: i.postAs,
    triggers: i.triggers,
    ...(i.workflow !== null ? { workflow: i.workflow } : {}),
  };
}

function errorReason(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const details = err.details as { reason?: unknown } | undefined;
  return typeof details?.reason === "string" ? details.reason : err.code;
}

/** 422 `provider_not_supported` (AC-6) → the offending provider name when the server sent one. */
export function providerNotSupported(err: unknown): { provider: string | null } | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  if (errorReason(err) !== REASON_PROVIDER_NOT_SUPPORTED) return null;
  const provider = (err.details as { provider?: unknown } | undefined)?.provider;
  return { provider: typeof provider === "string" ? provider : null };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/** Preview opens on the workflow — the one editable file — or the first file. */
export function defaultPreviewPath(files: readonly { path: string; kind: string }[]): string | undefined {
  return (files.find((f) => f.kind === "workflow") ?? files[0])?.path;
}
