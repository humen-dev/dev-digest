/**
 * USD cost formatting, shared by the PR list, the run timeline, and the run
 * trace. One rule so cost reads identically everywhere.
 *
 * - `null`/`undefined` → "—" (no data; NEVER "$0.00").
 * - real `0` → "$0.00" (a genuinely free model).
 * - `>= $0.01` → 3 dp (e.g. "$0.014", "$0.060").
 * - sub-cent → 2 significant figures (e.g. "$0.0013", "$0.000042"). Fixed 4 dp
 *   would flatten a real cheap-model run (~$0.00004) to "$0.0000" and collapse
 *   distinct tiny costs onto the same string, so precision follows magnitude.
 */
export function formatCost(costUsd: number | null | undefined): string {
  if (costUsd == null) return "—";
  if (costUsd === 0) return "$0.00";
  if (costUsd >= 0.01) return `$${costUsd.toFixed(3)}`;
  const sig2 = costUsd.toPrecision(2);
  // toPrecision only switches to exponent notation below $0.000001 — a run that
  // cheap is effectively free; show a floor rather than "$1.2e-7".
  return sig2.includes("e") ? "<$0.000001" : `$${sig2}`;
}
