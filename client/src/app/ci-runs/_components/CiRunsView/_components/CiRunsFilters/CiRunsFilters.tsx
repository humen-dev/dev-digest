"use client";

import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import { RANGE_LABEL_KEY, RANGE_ORDER, SOURCE_ORDER, STATUS_LABEL_KEY, STATUS_ORDER } from "../../constants";
import { s } from "../../styles";
import type { CiRunsFilterState, CiRunsRange } from "../../types";

interface Option {
  value: string;
  label: string;
}

/** Keep the selected value selectable even if the server vocabulary omits it. */
function withSelected(options: Option[], value: string): Option[] {
  return value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
}

export function CiRunsFilters({
  filters,
  agents,
  repos,
  onChange,
}: {
  filters: CiRunsFilterState;
  agents: { id: string; name: string }[];
  repos: string[];
  onChange: (patch: Partial<CiRunsFilterState>) => void;
}) {
  const t = useTranslations("ci");

  const rangeOptions = RANGE_ORDER.map((r) => ({ value: r, label: t(`runs.filters.${RANGE_LABEL_KEY[r]}`) }));
  const agentOptions = withSelected(
    [{ value: "", label: t("runs.filters.allAgents") }, ...agents.map((a) => ({ value: a.id, label: a.name }))],
    filters.agent,
  );
  const repoOptions = withSelected(
    [{ value: "", label: t("runs.filters.allRepos") }, ...repos.map((r) => ({ value: r, label: r }))],
    filters.repo,
  );
  const statusOptions = [
    { value: "", label: t("runs.filters.allStatuses") },
    ...STATUS_ORDER.map((st) => ({ value: st, label: t(`runs.status.${STATUS_LABEL_KEY[st]}`) })),
  ];
  const sourceOptions = [
    { value: "", label: t("runs.filters.allSources") },
    ...SOURCE_ORDER.map((src) => ({ value: src, label: t("runs.sourceGha") })),
  ];

  return (
    <div style={s.filters}>
      <SelectInput
        mono={false}
        value={filters.range}
        options={rangeOptions}
        onChange={(v) => onChange({ range: v as CiRunsRange })}
      />
      <SelectInput mono={false} value={filters.agent} options={agentOptions} onChange={(v) => onChange({ agent: v })} />
      <SelectInput mono={false} value={filters.repo} options={repoOptions} onChange={(v) => onChange({ repo: v })} />
      <SelectInput
        mono={false}
        value={filters.status}
        options={statusOptions}
        onChange={(v) => onChange({ status: v })}
      />
      <SelectInput
        mono={false}
        value={filters.source}
        options={sourceOptions}
        onChange={(v) => onChange({ source: v })}
      />
    </div>
  );
}
