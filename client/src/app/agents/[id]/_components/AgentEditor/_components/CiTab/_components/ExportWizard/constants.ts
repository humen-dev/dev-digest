import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** Wizard steps in order — the labels live in `ci.json` under `exportWizard.steps.*`. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_INDEX = { target: 0, preview: 1, configure: 2, install: 3 } as const satisfies Record<StepKey, number>;

/**
 * Local copy of `CI_REPO_FULL_NAME_RE` from @devdigest/shared — the client takes
 * type-only imports from the shared package (client/INSIGHTS.md), so the literal is duplicated.
 */
export const REPO_FULL_NAME_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;

/** Canonical trigger order (matches the generated workflow). */
export const ALL_TRIGGERS = ["opened", "synchronize", "reopened"] as const satisfies readonly CiTrigger[];
export const DEFAULT_TRIGGERS: CiTrigger[] = ["opened", "synchronize"];

export const DEFAULT_POST_AS: CiPostAs = "github_review";

/** Post-as radios in display order; `labelKey` is under `exportWizard.postAs.*`. */
export const POST_AS_OPTIONS = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
] as const satisfies readonly { value: CiPostAs; labelKey: string }[];

/** AC-14 — a workflow edit triggers a new preview only after the typing pauses. */
export const WORKFLOW_DEBOUNCE_MS = 500;

export const REASON_PROVIDER_NOT_SUPPORTED = "provider_not_supported";
export const CONFIG_TAB_HREF = "?tab=config";

export const OPENROUTER_SECRET_NAME = "OPENROUTER_API_KEY";
export const GITHUB_TOKEN_NAME = "GITHUB_TOKEN";

export const ZIP_FILENAME = "devdigest-ci.zip";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
