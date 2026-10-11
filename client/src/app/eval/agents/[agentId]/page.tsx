import { EvalAgentView } from "./_components/EvalAgentView";

/* Route: /eval/agents/:agentId (per-agent eval page). Thin route entry. */
export default async function EvalAgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <EvalAgentView agentId={agentId} />;
}
