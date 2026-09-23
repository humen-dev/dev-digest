import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';
import type { SettingsReader } from './ports.js';

/** Drizzle implementation of the settings read port. */
export class SettingsRepository implements SettingsReader {
  constructor(private readonly db: Db) {}

  async listByWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }
}
