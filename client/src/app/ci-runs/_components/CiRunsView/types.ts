/** URL-backed filter state of the CI Runs page. "" = no filter. */
export type CiRunsRange = "7d" | "30d" | "all";

export interface CiRunsFilterState {
  range: CiRunsRange;
  agent: string;
  repo: string;
  status: string;
  source: string;
}
