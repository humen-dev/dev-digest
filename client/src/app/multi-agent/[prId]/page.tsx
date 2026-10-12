import { Suspense } from "react";
import { MultiAgentResults } from "./_components/MultiAgentResults";

/* Route: /multi-agent/:prId[?multiRunId=&trace=]. Thin route entry — the view and
   its pieces live under _components/MultiAgentResults. The view reads the search
   params, so it sits under a Suspense boundary. */
export default function MultiAgentResultsPage() {
  return (
    <Suspense>
      <MultiAgentResults />
    </Suspense>
  );
}
