/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Provider ---------------------------------------------------------------
// "subscription" = the local Claude Code login (default). "openrouter" = OpenRouter's
// Anthropic-compatible endpoint with OPENROUTER_API_KEY — what CI uses.
export const EVAL_PROVIDER = process.env.EVAL_PROVIDER || "subscription";
export const IS_OPENROUTER = EVAL_PROVIDER === "openrouter";

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
// `||`, not `??`: CI passes an empty string for an unset input, which must fall back too.
//
// On OpenRouter the tiers get different models: skill/agent content runs with no tools, so the
// cheapest capable model does; the workflow tier asserts real tool use (Skill activation,
// subagent dispatch), which cheap DeepSeek models skip — they do the work inline instead.
export const EVAL_MODEL =
  process.env.EVAL_MODEL || (IS_OPENROUTER ? "deepseek/deepseek-v4-flash" : "claude-haiku-4-5");
export const EVAL_WORKFLOW_MODEL =
  process.env.EVAL_WORKFLOW_MODEL || (IS_OPENROUTER ? "google/gemini-3.6-flash" : EVAL_MODEL);
export const EVAL_JUDGE_MODEL =
  process.env.EVAL_JUDGE_MODEL || (IS_OPENROUTER ? "deepseek/deepseek-v4-pro" : "claude-sonnet-5");
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
