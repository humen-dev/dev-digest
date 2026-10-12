/* /multi-agent — sidebar entry. Sends the user to the latest multi-agent run's
   results, or to Configure run when there is none (or the lookup failed). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useLatestMultiAgentRun } from "@/lib/hooks/multi-agent";
import { multiAgentConfigureUrl, multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { s } from "./styles";

export function MultiAgentEntry() {
  const router = useRouter();
  const { data, isSuccess, isError } = useLatestMultiAgentRun();

  React.useEffect(() => {
    if (isSuccess && data) router.replace(multiAgentResultsUrl(data.pr_id, data.id));
    else if (isSuccess || isError) router.replace(multiAgentConfigureUrl());
  }, [isSuccess, isError, data, router]);

  return (
    <AppShell>
      <div style={s.page}>
        <Skeleton height={80} />
      </div>
    </AppShell>
  );
}
