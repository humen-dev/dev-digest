import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun";

/* Route: /multi-agent/configure[?prId=&agents=a,b]. Thin route entry — the view,
   styles and helpers live under _components/ConfigureRun. The view reads the
   search params, so it sits under a Suspense boundary. */
export default function ConfigureRunPage() {
  return (
    <Suspense>
      <ConfigureRun />
    </Suspense>
  );
}
