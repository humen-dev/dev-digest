import type { IconName } from "@devdigest/ui";

/** Fixed icon set an agent id is hashed into (AC-61). */
export const IDENTITY_ICONS = [
  "Shield",
  "Zap",
  "Bug",
  "Brain",
  "Sparkles",
  "Target",
  "Cpu",
  "Gauge",
  "Code",
  "Eye",
  "Wrench",
  "Lightbulb",
] as const satisfies readonly IconName[];

/** Hex so the tile background can append an alpha suffix. */
export const IDENTITY_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#84cc16",
] as const;

export interface Identity {
  icon: IconName;
  color: string;
  background: string;
}

const NEUTRAL: Identity = { icon: "User", color: "var(--text-muted)", background: "var(--bg-hover)" };
export const NEUTRAL_COLOR = NEUTRAL.color;

/** djb2 — deterministic across renders and reloads. */
function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable colour for any key (agent id, model name); `null` is the neutral colour. */
export function colorForKey(key: string | null): string {
  return key == null ? NEUTRAL_COLOR : IDENTITY_COLORS[hash(key) % IDENTITY_COLORS.length]!;
}

/** Icon + colour of an agent derived from its id (Q2a); the Unknown agent (`null`) is neutral. */
export function agentIdentity(id: string | null): Identity {
  if (id == null) return NEUTRAL;
  const color = colorForKey(id);
  return { icon: IDENTITY_ICONS[Math.floor(hash(id) / IDENTITY_COLORS.length) % IDENTITY_ICONS.length]!, color, background: `${color}1f` };
}
