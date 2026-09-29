import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkClone } from '../src/modules/repo-intel/pipeline/walk.js';
import { analyzePythonProject, isPythonFile } from '../src/adapters/python/index.js';

const FIXTURE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'django-mini');

const CONTACT_ENDPOINTS = [
  'ANY /',
  'ANY /api/contacts/',
  'ANY /api/contacts/{pk}/',
  'GET /lookup/',
  'POST /api/contacts/import_csv/',
  'POST /lookup/',
];
const CONTACT_HANDLERS = {
  'ANY /': ['contact_list'],
  'GET /lookup/': ['contact_lookup'],
  'POST /lookup/': ['contact_lookup'],
  'ANY /api/contacts/': ['ContactViewSet'],
  'ANY /api/contacts/{pk}/': ['ContactViewSet'],
  'POST /api/contacts/import_csv/': ['ContactViewSet.import_csv'],
};
const TASK_CRONS = [
  '0 7 * * 1 (send_weekly_report)',
  'every 300s (cleanup)',
  'job:reports.cleanup',
  'job:send_weekly_report',
];

describe('analyzePythonProject', () => {
  it('isPythonFile is extension-based and case-insensitive', () => {
    expect(isPythonFile('a/b.py')).toBe(true);
    expect(isPythonFile('a/B.PY')).toBe(true);
    expect(isPythonFile('a/b.pyc')).toBe(false);
    expect(isPythonFile('a/b.ts')).toBe(false);
  });

  it('returns the expected facts and edges for the django-mini fixture', async () => {
    const { files } = await walkClone(FIXTURE_ROOT);
    const res = await analyzePythonProject(FIXTURE_ROOT, files, { deadlineAt: Date.now() + 60_000 });

    expect(res.truncated).toBe(false);
    expect(res.degraded).toEqual([]);

    const byFile = new Map(res.facts.map((r) => [r.filePath, r]));
    expect([...byFile.keys()].sort()).toEqual([
      'apps/contacts/urls.py',
      'apps/contacts/views.py',
      'apps/history/views.py',
      'apps/reports/tasks.py',
      'config/settings.py',
      'config/urls.py',
    ]);
    for (const f of ['apps/contacts/urls.py', 'apps/contacts/views.py']) {
      expect(byFile.get(f)).toEqual({
        filePath: f,
        endpoints: CONTACT_ENDPOINTS,
        crons: [],
        endpointHandlers: CONTACT_HANDLERS,
        cronHandlers: {},
      });
    }
    for (const f of ['config/urls.py', 'apps/history/views.py']) {
      expect(byFile.get(f)).toEqual({
        filePath: f,
        endpoints: ['GET /api/history/'],
        crons: [],
        endpointHandlers: { 'GET /api/history/': ['HistoryListView'] },
        cronHandlers: {},
      });
    }
    expect(byFile.get('config/settings.py')).toEqual({
      filePath: 'config/settings.py',
      endpoints: [],
      crons: ['0 7 * * 1 (send_weekly_report)', 'every 300s (cleanup)'],
      endpointHandlers: {},
      cronHandlers: {
        '0 7 * * 1 (send_weekly_report)': ['send_weekly_report'],
        'every 300s (cleanup)': ['cleanup'],
      },
    });
    expect(byFile.get('apps/reports/tasks.py')).toEqual({
      filePath: 'apps/reports/tasks.py',
      endpoints: [],
      crons: TASK_CRONS,
      endpointHandlers: {},
      cronHandlers: {
        '0 7 * * 1 (send_weekly_report)': ['send_weekly_report'],
        'every 300s (cleanup)': ['cleanup'],
        'job:reports.cleanup': ['cleanup'],
        'job:send_weekly_report': ['send_weekly_report'],
      },
    });

    const edges = new Set(res.edges.map((e) => `${e.from} -> ${e.to}`));
    for (const e of [
      'apps/contacts/serializers.py -> apps/tools/phone.py',
      'apps/contacts/serializers.py -> apps/contacts/models.py',
      'apps/contacts/views.py -> apps/tools/phone.py',
      'apps/contacts/views.py -> apps/contacts/serializers.py',
      'apps/contacts/urls.py -> apps/contacts/views.py',
      'config/urls.py -> apps/history/views.py',
      'apps/reports/tasks.py -> apps/tools/phone.py',
    ]) {
      expect(edges.has(e)).toBe(true);
    }
    // POSIX keys only.
    expect(res.edges.every((e) => !e.from.includes('\\') && !e.to.includes('\\'))).toBe(true);
  });

  it('a deadline in the past truncates without throwing', async () => {
    const { files } = await walkClone(FIXTURE_ROOT);
    const res = await analyzePythonProject(FIXTURE_ROOT, files, { deadlineAt: Date.now() - 1 });
    expect(res.truncated).toBe(true);
    expect(res.facts).toEqual([]);
  });

  it('reports unreadable files as degraded instead of throwing', async () => {
    const res = await analyzePythonProject(FIXTURE_ROOT, ['missing/nope.py', 'README.md'], {
      deadlineAt: Date.now() + 60_000,
    });
    expect(res.degraded.map((d) => d.file)).toEqual(['missing/nope.py']);
  });
});
