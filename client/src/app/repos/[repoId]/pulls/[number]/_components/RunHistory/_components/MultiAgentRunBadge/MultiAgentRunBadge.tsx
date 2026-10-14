import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { multiAgentResultsUrl } from "@/lib/multi-agent-urls";

/** "Multi-agent" badge on a timeline row — a plain link to that row's own multi-agent results. */
export function MultiAgentRunBadge({ prId, multiRunId }: { prId: string; multiRunId: string }) {
  const t = useTranslations("prReview");
  const label = t("timeline.multiAgentOpen");
  return (
    <Link
      href={multiAgentResultsUrl(prId, multiRunId)}
      aria-label={label}
      title={label}
      style={{ display: "inline-flex", flexShrink: 0, textDecoration: "none" }}
    >
      <Badge icon="Users">{t("timeline.multiAgent")}</Badge>
    </Link>
  );
}
