import type { ConventionCategory } from "@devdigest/shared";

/** Confidence bar colour bands (percent), mirroring `ConfidenceNum`. */
export const CONFIDENCE_OK_MIN = 85;
export const CONFIDENCE_WARN_MIN = 65;

/** Categories selectable in the inline editor (order = display order). */
export const CATEGORY_OPTIONS: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "typing",
  "error_handling",
  "api",
  "data_access",
  "testing",
  "style",
  "other",
];

/** Skeleton cards while the board loads. */
export const SKELETON_CARDS = 3;

/** Create-skill modal width (px). */
export const CREATE_SKILL_MODAL_WIDTH = 760;

/** How long the "Copied" state of the snippet copy button lasts (ms). */
export const COPIED_RESET_MS = 1200;
