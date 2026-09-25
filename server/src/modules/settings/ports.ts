import type { SettingsRow } from './helpers.js';

/**
 * Read side of the workspace settings (non-secret key/value prefs). Consumers
 * that only need to *read* a pref (e.g. the feature-model resolver) depend on
 * this port instead of the `settings` table.
 */
export interface SettingsReader {
  listByWorkspace(workspaceId: string): Promise<SettingsRow[]>;
}
