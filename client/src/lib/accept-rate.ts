/** Fewer decided findings than this is a "small sample" (shown with a badge). */
export const SMALL_SAMPLE_THRESHOLD = 5;

/** True for 1..4 decided findings; 0 decided is "no data", not a small sample. */
export function isSmallSample(decided: number): boolean {
  return decided > 0 && decided < SMALL_SAMPLE_THRESHOLD;
}

/** Accept rate (0..1) as a whole percent. */
export function ratePercent(rate: number): number {
  return Math.round(rate * 100);
}
