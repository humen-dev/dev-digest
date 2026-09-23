/* Route: /repos/:repoId/conventions (Skills Lab → Conventions). Thin route
   entry — the board, its card, the create-skill modal and their helpers are
   colocated under _components/. */
"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const params = useParams<{ repoId: string }>();
  return <ConventionsView repoId={params.repoId} />;
}
