import { REFRESH_DEBOUNCE_MS } from '../constants.js';

/** AC-74 / NFR-5 — skip a refresh made less than 30 s after the last one, unless forced. */
export function shouldSkipDebounced(lastRefreshedAt: Date | null, now: Date, force: boolean): boolean {
  if (force || lastRefreshedAt === null) return false;
  return now.getTime() - lastRefreshedAt.getTime() < REFRESH_DEBOUNCE_MS;
}
