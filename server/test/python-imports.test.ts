import { describe, it, expect } from 'vitest';
import {
  buildModuleIndex,
  buildPythonEdges,
  resolveDottedString,
  resolveImport,
  resolveModule,
  resolveNameToFile,
} from '../src/adapters/python/imports.js';
import type { PyImport, PyImportsOf } from '../src/adapters/python/types.js';

const from = (
  module: string,
  names: Array<string | [string, string]>,
  level = 0,
  line = 1,
): PyImport => ({
  kind: 'from',
  line,
  level,
  module,
  names: names.map((n) => (typeof n === 'string' ? { name: n, alias: null } : { name: n[0], alias: n[1] })),
  star: false,
  alias: null,
});
const imp = (module: string, alias: string | null = null, line = 1): PyImport => ({
  kind: 'import',
  line,
  level: 0,
  module,
  names: [],
  star: false,
  alias,
});

const FILES = [
  'manage.py',
  'config/__init__.py',
  'config/settings.py',
  'config/urls.py',
  'apps/__init__.py',
  'apps/tools/__init__.py',
  'apps/tools/phone.py',
  'apps/contacts/__init__.py',
  'apps/contacts/models.py',
  'apps/contacts/serializers.py',
  'apps/contacts/views.py',
  'apps/contacts/urls.py',
  'apps/history/__init__.py',
  'apps/history/views.py',
  'apps/reports/__init__.py',
  'apps/reports/tasks.py',
];

const IMPORTS: Record<string, PyImport[]> = {
  'config/settings.py': [from('celery.schedules', ['crontab'])],
  'config/urls.py': [
    from('django.contrib', ['admin']),
    from('django.urls', ['include', 'path']),
    from('apps.history.views', ['HistoryListView']),
  ],
  'apps/contacts/serializers.py': [
    from('rest_framework', ['serializers']),
    from('apps.tools.phone', ['normalize_phone']),
    from('models', ['Contact'], 1),
  ],
  'apps/contacts/views.py': [
    from('django.shortcuts', ['render']),
    from('apps.tools', ['phone']),
    from('models', ['Contact'], 1),
    from('serializers', ['ContactSerializer'], 1),
  ],
  'apps/contacts/urls.py': [from('django.urls', ['include', 'path']), from('', ['views'], 1)],
  'apps/contacts/models.py': [from('django.db', ['models'])],
  'apps/tools/phone.py': [imp('re')],
  'apps/reports/tasks.py': [from('celery', ['shared_task']), from('apps.tools.phone', ['normalize_phone'])],
  'manage.py': [imp('os'), imp('sys')],
};
const importsOf: PyImportsOf = (f) => IMPORTS[f] ?? [];

describe('python imports', () => {
  const index = buildModuleIndex(FILES);

  it('resolves the django-mini walk list and builds a clean, sorted edge set', () => {
    expect(index.sourceRoots).toEqual(['']);
    expect(resolveModule(index, 'x.py', 0, 'apps.tools.phone')).toBe('apps/tools/phone.py');
    expect(resolveModule(index, 'x.py', 0, 'apps.tools')).toBe('apps/tools/__init__.py');

    const of = (file: string, i: PyImport) => resolveImport(index, file, i, importsOf);
    expect(of('a.py', from('apps.tools.phone', ['normalize_phone']))).toEqual(['apps/tools/phone.py']);
    // the submodule wins over the package
    expect(of('a.py', from('apps.tools', ['phone']))).toEqual(['apps/tools/phone.py']);
    expect(of('apps/contacts/urls.py', from('', ['views'], 1))).toEqual(['apps/contacts/views.py']);
    expect(of('apps/contacts/views.py', from('models', ['Contact'], 1))).toEqual(['apps/contacts/models.py']);
    expect(of('a.py', from('django.urls', ['path']))).toEqual([]);
    expect(of('a.py', imp('apps.tools.phone.extra'))).toEqual(['apps/tools/phone.py']);
    expect(of('a.py', imp('os'))).toEqual([]);
    expect(of('apps/tools/phone.py', from('phone', ['x'], 1))).toEqual([]); // self excluded

    const edges = buildPythonEdges(index, importsOf);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'config/urls.py', to: 'apps/history/views.py' },
        { from: 'apps/contacts/serializers.py', to: 'apps/tools/phone.py' },
        { from: 'apps/contacts/serializers.py', to: 'apps/contacts/models.py' },
        { from: 'apps/contacts/views.py', to: 'apps/tools/phone.py' },
        { from: 'apps/contacts/views.py', to: 'apps/contacts/serializers.py' },
        { from: 'apps/contacts/urls.py', to: 'apps/contacts/views.py' },
        { from: 'apps/reports/tasks.py', to: 'apps/tools/phone.py' },
      ]),
    );
    expect(edges.some((e) => e.from === e.to)).toBe(false);
    expect(new Set(edges.map((e) => `${e.from}>${e.to}`)).size).toBe(edges.length);
    expect(edges.some((e) => e.to.includes('celery') || e.to.includes('django'))).toBe(false);
    const sorted = [...edges].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
    expect(edges.map((e) => e.from)).toEqual(sorted.map((e) => e.from));
  });

  it('handles source roots: manage.py dir, src/, ambiguous suffix, relative levels', () => {
    const be = buildModuleIndex(['backend/manage.py', 'backend/apps/x.py', 'backend/apps/__init__.py', 'other/y.py']);
    expect(be.sourceRoots).toEqual(['backend', '']);
    expect(resolveModule(be, 'other/y.py', 0, 'apps.x')).toBe('backend/apps/x.py');

    const src = buildModuleIndex(['src/pkg/a.py', 'src/pkg/__init__.py']);
    expect(src.sourceRoots).toEqual(['src', '']);
    expect(resolveModule(src, 'z.py', 0, 'pkg.a')).toBe('src/pkg/a.py');

    const amb = buildModuleIndex(['a/pkg/util.py', 'b/pkg/util.py', 'c/pkg/only.py', 'c/pkg/__init__.py']);
    expect(resolveModule(amb, 'z.py', 0, 'pkg.util')).toBeNull(); // ambiguous suffix
    expect(resolveModule(amb, 'z.py', 0, 'pkg.only')).toBe('c/pkg/only.py'); // unique multi-segment suffix
    expect(resolveModule(amb, 'z.py', 0, 'only')).toBeNull(); // single segment never uses the fallback

    const rel = buildModuleIndex(['p/q/a.py', 'p/b.py', 'p/__init__.py', 'p/q/__init__.py']);
    expect(resolveModule(rel, 'p/q/a.py', 2, 'b')).toBe('p/b.py');
    expect(resolveModule(rel, 'p/q/a.py', 2, '')).toBe('p/__init__.py');
    expect(resolveModule(rel, 'p/q/a.py', 1, 'nope')).toBeNull();
  });

  it('never maps stdlib/third-party absolute imports onto same-named local files', () => {
    const idx = buildModuleIndex(['manage.py', 'proj/celery.py', 'app/tasks.py', 'core/logging.py', 'core/use.py']);
    const io: PyImportsOf = (f) =>
      f === 'app/tasks.py' ? [from('celery', ['shared_task'])] : f === 'core/use.py' ? [imp('logging')] : [];
    const edges = buildPythonEdges(idx, io);
    expect(edges).toEqual([]);
    expect(resolveNameToFile(idx, 'app/tasks.py', 'shared_task', io)).toBeNull();
    expect(resolveImport(idx, 'core/use.py', imp('logging'), io)).toEqual([]);
  });

  it('follows a one-hop __init__ re-export', () => {
    const idx = buildModuleIndex(['pkg/__init__.py', 'pkg/impl.py', 'main.py']);
    const io: PyImportsOf = (f) => (f === 'pkg/__init__.py' ? [from('impl', ['helper'], 1)] : []);
    expect(resolveImport(idx, 'main.py', from('pkg', ['helper']), io)).toEqual(['pkg/impl.py']);
    expect(resolveNameToFile(idx, 'main.py', 'helper', (f) => (f === 'main.py' ? [from('pkg', ['helper'])] : io(f)))).toEqual(
      { file: 'pkg/impl.py', name: 'helper' },
    );
  });

  it('resolves names and dotted strings to files', () => {
    // A later third-party `from` binding shadows an earlier local `import`: no false local hit.
    const shadowed: PyImportsOf = (f) => (f === 'x.py' ? [imp('apps.tools.phone'), from('django', ['apps'])] : []);
    expect(resolveNameToFile(index, 'x.py', 'apps.tools.phone', shadowed)).toBeNull();
    expect(resolveNameToFile(index, 'apps/contacts/urls.py', 'views.ContactViewSet', importsOf)).toEqual({
      file: 'apps/contacts/views.py',
      name: 'ContactViewSet',
    });
    expect(resolveNameToFile(index, 'config/urls.py', 'HistoryListView', importsOf)).toEqual({
      file: 'apps/history/views.py',
      name: 'HistoryListView',
    });
    expect(resolveNameToFile(index, 'config/urls.py', 'path', importsOf)).toBeNull();
    expect(resolveNameToFile(index, 'config/urls.py', 'unknown', importsOf)).toBeNull();

    // plain and aliased `import`
    const io: PyImportsOf = () => [imp('apps.tools.phone'), imp('apps.reports.tasks', 't')];
    expect(resolveNameToFile(index, 'x.py', 'apps.tools.phone.normalize_phone', io)).toEqual({
      file: 'apps/tools/phone.py',
      name: 'normalize_phone',
    });
    expect(resolveNameToFile(index, 'x.py', 't.cleanup', io)).toEqual({
      file: 'apps/reports/tasks.py',
      name: 'cleanup',
    });

    expect(resolveDottedString(index, 'apps.reports.tasks.send_weekly_report')).toEqual({
      file: 'apps/reports/tasks.py',
      name: 'send_weekly_report',
    });
    expect(resolveDottedString(index, 'apps.contacts.urls')).toEqual({ file: 'apps/contacts/urls.py', name: '' });
    expect(resolveDottedString(index, 'nothing.here')).toBeNull();
  });
});
