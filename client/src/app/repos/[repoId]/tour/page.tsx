/* Route: /repos/:repoId/tour (WORKSPACE → Onboarding Tour, SPEC-03). Thin
   route entry — data fetching, state machine and section composition are
   colocated under _components/TourView. */
"use client";

import { useParams } from "next/navigation";
import { TourView } from "./_components/TourView";

export default function OnboardingTourPage() {
  const params = useParams<{ repoId: string }>();
  return <TourView repoId={params.repoId} />;
}
