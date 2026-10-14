/* Pure URL builders for the Multi-Agent Review routes. */

/** /multi-agent/<prId>[?multiRunId=<id>] — the results page. */
export function multiAgentResultsUrl(prId: string, multiRunId?: string): string {
  const base = `/multi-agent/${encodeURIComponent(prId)}`;
  return multiRunId ? `${base}?multiRunId=${encodeURIComponent(multiRunId)}` : base;
}

/** /multi-agent/configure[?prId=&agents=a,b] — the Configure run page. */
export function multiAgentConfigureUrl(o: { prId?: string; agentIds?: string[] } = {}): string {
  const params = new URLSearchParams();
  if (o.prId) params.set("prId", o.prId);
  if (o.agentIds && o.agentIds.length > 0) params.set("agents", o.agentIds.join(","));
  const qs = params.toString();
  return qs ? `/multi-agent/configure?${qs}` : "/multi-agent/configure";
}
