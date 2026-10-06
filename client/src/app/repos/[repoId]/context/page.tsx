/* Route: /repos/:repoId/context (WORKSPACE → Project Context, SPEC-01). Thin
   route entry — the tree, preview, editor and their helpers are colocated
   under _components/. */
"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  const params = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={params.repoId} />;
}
