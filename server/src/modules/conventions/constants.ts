/**
 * Constants for the conventions extractor (sampling budgets, gate thresholds,
 * ripgrep bounds). See server/specs/conventions.md.
 */

/**
 * Config / house-rule documents read before the ranked code files. Missing
 * ones are skipped silently; they tell the model which rules are already
 * tool-enforced (lint, format, paths) and which are written down.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  '.editorconfig',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'biome.json',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  '.github/CONTRIBUTING.md',
] as const;

/** Top-ranked code files taken through `repoIntel.getConventionSamples()`. */
export const TOP_SAMPLES = 12;
/** Extra files picked from layer buckets the top-N did not cover (tests included). */
export const DIVERSITY_EXTRA = 6;
/** How many ranked paths the diversity pass considers. */
export const RANK_POOL = 400;

/** Per-file caps (code files). */
export const CODE_FILE_MAX_LINES = 200;
export const CODE_FILE_MAX_CHARS = 10_000;
/** Per-file cap for config / docs files. */
export const CONFIG_FILE_MAX_CHARS = 6_000;
/** Whole-sample character budget (keeps one cheap call bounded). */
export const SAMPLE_BUDGET_CHARS = 90_000;

/** The model is asked for at most this many candidates. */
export const MAX_CANDIDATES = 12;
/** A snippet with fewer non-space characters identifies nothing (`}`, `});`). */
export const MIN_SNIPPET_CHARS = 8;
/** Kept snippets are cut to this many lines. */
export const SNIPPET_MAX_LINES = 15;

/** Token-Jaccard at/above which two rules are the same rule. */
export const DEDUPE_JACCARD = 0.6;
/** Decided (accepted + rejected) rules passed back to the model, newest first. */
export const MAX_DECIDED_IN_PROMPT = 40;

/** ripgrep frequency pass bounds. */
export const GREP_TIMEOUT_MS = 5_000;
export const GREP_TOTAL_BUDGET_MS = 20_000;
export const GREP_CONCURRENCY = 4;
export const GREP_MAX_CANDIDATES = 20;
export const LITERAL_MIN_CHARS = 6;
export const LITERAL_MAX_CHARS = 80;
/** A model literal matching this many files or fewer is a coincidence, not a convention. */
export const RARE_MAX_FILES = 1;

/** Structured-output call settings. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const EXTRACTION_TEMPERATURE = 0.1;
export const EXTRACTION_MAX_TOKENS = 4_000;
export const EXTRACTION_TIMEOUT_MS = 120_000;

/** Skill assembly. */
export const SKILL_NAME_SUFFIX = '-conventions';
export const SKILL_SNIPPET_MAX_LINES = 6;
