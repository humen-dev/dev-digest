import type { CiExportInputBody, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ALL_TRIGGERS, REASON_PROVIDER_NOT_SUPPORTED, REPO_FULL_NAME_RE } from "./constants";

export function isRepoValid(repo: string): boolean {
  return REPO_FULL_NAME_RE.test(repo.trim());
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
