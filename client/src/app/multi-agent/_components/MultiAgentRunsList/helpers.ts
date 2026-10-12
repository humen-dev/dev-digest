import type { MultiAgentRunsListAgent, MultiAgentRunsListItem } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { VISIBLE_AGENTS } from "./constants";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Total cost label: "$sum + n unpriced" when some agent has no known cost (AC-82). */
export function costLabel(
  item: Pick<MultiAgentRunsListItem, "total_cost_usd" | "unpriced_count">,
  t: Translate,
): string {
  if (item.unpriced_count > 0) {
    return t("results.unpriced", { cost: formatCost(item.total_cost_usd ?? 0), count: item.unpriced_count });
  }
  return formatCost(item.total_cost_usd);
}

/** First agents shown in a row plus how many are hidden (AC-81). */
export function visibleAgents(agents: MultiAgentRunsListAgent[]): {
  visible: MultiAgentRunsListAgent[];
  overflow: number;
} {
  return {
    visible: agents.slice(0, VISIBLE_AGENTS),
    overflow: Math.max(0, agents.length - VISIBLE_AGENTS),
  };
}

/** Overall state text: "running", "done" or "<n> failed". */
export function stateLabel(item: Pick<MultiAgentRunsListItem, "state" | "failed_count">, t: Translate): string {
  if (item.state === "failed") return t("list.state.failed", { count: item.failed_count });
  return t(`list.state.${item.state}`);
}
