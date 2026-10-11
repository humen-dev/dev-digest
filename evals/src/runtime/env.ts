/**
 * Child-process environment for the SDK. The one job here: route the session to the chosen
 * provider (EVAL_PROVIDER) and nowhere else.
 */

import { EVAL_PROVIDER } from "../config.js";

/**
 * OpenRouter's Anthropic-compatible endpoint is only guaranteed for anthropic/* models; for
 * Gemini / DeepSeek CI points OPENROUTER_BASE_URL at the LiteLLM translating proxy
 * (evals/proxy/litellm.config.yaml), which speaks Anthropic in and OpenRouter out.
 */
const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api").replace(/\/$/, "");

/**
 * Copy the current env with every credential removed, then add back only the selected provider's.
 *
 * - subscription: no key at all. A key in the environment takes priority over the Claude Code
 *   subscription, so without this every eval run would silently bill API tokens.
 * - openrouter: OpenRouter (directly or through the proxy). Every model alias Claude Code may
 *   resolve on its own (agent frontmatter `model: sonnet|opus`, the background haiku-class
 *   calls, subagents) is pinned to `model` — otherwise a dispatched subagent would ask
 *   OpenRouter for a real Claude Opus.
 */
export function sessionEnv(model: string): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const openrouterKey = env.OPENROUTER_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  delete env.OPENROUTER_API_KEY;

  if (EVAL_PROVIDER === "subscription") return env;
  if (EVAL_PROVIDER !== "openrouter") {
    throw new Error(`EVAL_PROVIDER must be "subscription" or "openrouter", got "${EVAL_PROVIDER}"`);
  }
  if (!openrouterKey) throw new Error("EVAL_PROVIDER=openrouter needs OPENROUTER_API_KEY");

  return {
    ...env,
    ANTHROPIC_BASE_URL: OPENROUTER_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: openrouterKey,
    ANTHROPIC_API_KEY: "", // must be explicitly empty, or Claude Code may authenticate to Anthropic
    ANTHROPIC_DEFAULT_FABLE_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
  };
}
