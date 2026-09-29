import { describe, it, expect } from 'vitest';
import { scanPython } from '../src/adapters/python/scan.js';
import type { PyExpr, PyOutline } from '../src/adapters/python/types.js';

const SETTINGS = String.raw`from celery.schedules import crontab

ROOT_URLCONF = "config.urls"

CELERY_BEAT_SCHEDULE = {
    "weekly-report": {
        "task": "apps.reports.tasks.send_weekly_report",
        "schedule": crontab(minute=0, hour=7, day_of_week=1),
    },
    "cleanup": {
        "task": "apps.reports.tasks.cleanup",
        "schedule": 300,
    },
}
`;

const ROOT_URLS = String.raw`from django.contrib import admin
from django.urls import include, path

from apps.history.views import HistoryListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("apps.contacts.urls")),
    path("api/history/", HistoryListView.as_view(), name="history"),
]
`;

const PHONE = String.raw`import re

_NON_DIGITS = re.compile(r"\D+")


def _digits(raw):
    return _NON_DIGITS.sub("", raw or "")


def normalize_phone(raw):
    """Return '+' followed by the digits of raw, or '' when there are none."""
    digits = _digits(raw)
    return f"+{digits}" if digits else ""
`;

const SERIALIZERS = String.raw`from rest_framework import serializers

from apps.tools.phone import normalize_phone

from .models import Contact


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"

    def validate_phone(self, value):
        return normalize_phone(value)
`;

const VIEWS = String.raw`from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.tools import phone

from .models import Contact
from .serializers import ContactSerializer


def contact_list(request):
    return render(request, "contacts/list.html", {"contacts": Contact.objects.all()})


@api_view(["GET", "POST"])
def contact_lookup(request):
    return Response({"phone": phone.normalize_phone(request.GET.get("q"))})


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer

    @action(detail=False, methods=["post"], url_path="import_csv")
    def import_csv(self, request):
        rows = [phone.normalize_phone(r) for r in request.data.get("phones", [])]
        return Response({"imported": len(rows)})
`;

const URLS = String.raw`from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"contacts", views.ContactViewSet, basename="contact")

urlpatterns = [
    path("", views.contact_list, name="contact-list"),
    path("lookup/", views.contact_lookup, name="contact-lookup"),
    path("api/", include(router.urls)),
]
`;

const MIGRATION = String.raw`from django.db import migrations

from apps.tools.phone import normalize_phone


def forwards(apps, schema_editor):
    normalize_phone("")


class Migration(migrations.Migration):
    dependencies = []
    operations = [migrations.RunPython(forwards)]
`;

const TASKS = String.raw`from celery import shared_task

from apps.tools.phone import normalize_phone


@shared_task
def send_weekly_report():
    return normalize_phone("+1 555 0100")


@shared_task(name="reports.cleanup")
def cleanup():
    return None
`;

const MANAGE = String.raw`#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
`;

const SOURCES = [SETTINGS, ROOT_URLS, PHONE, SERIALIZERS, VIEWS, URLS, MIGRATION, TASKS, MANAGE];

function uses(o: PyOutline): string[] {
  return o.nameUses.map((u) => `${u.dotted}${u.isCall ? '()' : ''}`);
}
function asCall(e: PyExpr | undefined) {
  if (!e || e.kind !== 'call') throw new Error(`expected call, got ${e?.kind}`);
  return e;
}

describe('scanPython imports', () => {
  it('parses every import form', () => {
    const o = scanPython(
      [
        'import os, sys as system',
        'import a.b.c',
        'import a.b as ab',
        'from x.y import z, w as v',
        'from . import views',
        'from .. import pkg',
        'from ...deep.mod import name',
        'from m import *',
        'from n import (',
        '    one,',
        '    two as deux,',
        ')',
        'try:',
        '    import simplejson as json',
        'except ImportError:',
        '    import json',
        'def f():',
        '    from lazy import thing',
      ].join('\n'),
    );
    expect(o.imports.map((i) => [i.kind, i.level, i.module, i.names.map((n) => `${n.name}:${n.alias}`), i.star, i.alias, i.line])).toEqual([
      ['import', 0, 'os', [], false, null, 1],
      ['import', 0, 'sys', [], false, 'system', 1],
      ['import', 0, 'a.b.c', [], false, null, 2],
      ['import', 0, 'a.b', [], false, 'ab', 3],
      ['from', 0, 'x.y', ['z:null', 'w:v'], false, null, 4],
      ['from', 1, '', ['views:null'], false, null, 5],
      ['from', 2, '', ['pkg:null'], false, null, 6],
      ['from', 3, 'deep.mod', ['name:null'], false, null, 7],
      ['from', 0, 'm', [], true, null, 8],
      ['from', 0, 'n', ['one:null', 'two:deux'], false, null, 9],
      ['import', 0, 'simplejson', [], false, 'json', 14],
      ['import', 0, 'json', [], false, null, 16],
      ['from', 0, 'lazy', ['thing:null'], false, null, 18],
    ]);
  });

  it('handles one-line compound bodies and semicolons', () => {
    const o = scanPython('try: import a\nexcept ImportError: import b; import c\n');
    expect(o.imports.map((i) => i.module)).toEqual(['a', 'b', 'c']);
  });

  it('parses the relative import of the fixture urls.py', () => {
    const o = scanPython(URLS);
    expect(o.imports.filter((i) => i.kind === 'from')).toHaveLength(3);
    expect(o.imports[2]).toMatchObject({ kind: 'from', level: 1, module: '', names: [{ name: 'views', alias: null }] });
  });
});

describe('scanPython defs, classes, decorators', () => {
  it('records endLine, async, one-liners, multi-line signatures and decorators', () => {
    const src = [
      '@dec',
      '@other.dec(1, key="v")',
      'async def a(x: int, *args, y=1,',
      '            **kw) -> dict:  # comment',
      '    """doc',
      '    string"""',
      '    return {}',
      '',
      '# trailing comment',
      'def b(): return 1',
      'class C(Base, metaclass=Meta):',
      '    x = 1',
      '    def m(self): pass',
      '    def n(self):',
      '        def inner(): pass',
      '        class Nested: pass',
      '    class Meta:',
      '        model = None',
      '',
      'def last(): pass',
    ].join('\n');
    const o = scanPython(src);
    expect(o.functions.map((f) => [f.name, f.line, f.endLine, f.async])).toEqual([
      ['a', 3, 7, true],
      ['b', 10, 10, false],
      ['last', 20, 20, false],
    ]);
    const a = o.functions[0]!;
    expect(a.signature).toBe('async def a(x: int, *args, y=1, **kw) -> dict');
    expect(a.decorators.map((d) => [d.line, d.expr.kind])).toEqual([
      [1, 'name'],
      [2, 'call'],
    ]);
    const dec = asCall(a.decorators[1]!.expr);
    expect(dec.callee).toBe('other.dec');
    expect(dec.args.map((x) => x.keyword)).toEqual([null, 'key']);

    expect(o.classes).toHaveLength(1);
    const c = o.classes[0]!;
    expect(c).toMatchObject({ name: 'C', line: 11, endLine: 18, signature: 'class C(Base, metaclass=Meta)' });
    expect(c.bases.map((x) => [x.keyword, x.value.kind])).toEqual([
      [null, 'name'],
      ['metaclass', 'name'],
    ]);
    expect(c.methods.map((m) => [m.name, m.line, m.endLine])).toEqual([
      ['m', 13, 13],
      ['n', 14, 16],
    ]);
    expect(c.assignments.map((x) => x.targets)).toEqual([['x']]);
    // nested defs / classes are not outline members
    expect(o.functions.some((f) => f.name === 'inner')).toBe(false);
    expect(o.classes.some((k) => k.name === 'Nested' || k.name === 'Meta')).toBe(false);
  });

  it('counts defs inside top-level if/try/with as module level', () => {
    const o = scanPython('if X:\n    def a(): pass\nelse:\n    def b(): pass\ntry:\n    class C: pass\nexcept E:\n    pass\n');
    expect(o.functions.map((f) => f.name)).toEqual(['a', 'b']);
    expect(o.classes.map((c) => c.name)).toEqual(['C']);
  });

  it('parses the fixture views.py', () => {
    const o = scanPython(VIEWS);
    expect(o.functions.map((f) => f.name)).toEqual(['contact_list', 'contact_lookup']);
    const cls = o.classes[0]!;
    expect(cls.name).toBe('ContactViewSet');
    const m = cls.methods[0]!;
    expect(m.name).toBe('import_csv');
    const action = asCall(m.decorators[0]!.expr);
    expect(action.callee).toBe('action');
    expect(action.args.map((a) => a.keyword)).toEqual(['detail', 'methods', 'url_path']);
    expect(action.args[1]!.value).toMatchObject({ kind: 'seq', items: [{ kind: 'str', value: 'post' }] });
    expect(cls.assignments.map((a) => a.targets[0])).toEqual(['queryset', 'serializer_class']);
    expect(o.functions[1]!.decorators[0]!.expr).toMatchObject({ kind: 'call', callee: 'api_view' });
  });

  it('keeps async/await/soft keywords intact', () => {
    const src = [
      'match = re.match(r"x", s)',
      'match command:',
      '    case [a, *rest] if a:',
      '        go(a)',
      '    case _:',
      '        stop()',
      'async def f():',
      '    async with a as b:',
      '        await b.run()',
      '    async for i in gen():',
      '        pass',
    ].join('\n');
    const o = scanPython(src);
    expect(o.functions.map((f) => f.name)).toEqual(['f']);
    expect(o.calls.map((c) => c.callee)).toEqual(['re.match', 'go', 'stop', 'b.run', 'gen']);
    expect(o.assignments.map((a) => a.targets)).toEqual([['match']]);
  });
});

describe('scanPython calls', () => {
  it('records keyword/star args and nested calls in source order', () => {
    const o = scanPython('result = outer(1, *rest, key=inner(x), **opts)(again)\n');
    expect(o.calls.map((c) => c.callee)).toEqual(['outer', 'inner', '']);
    const outer = asCall(o.calls[0]);
    expect(outer.args.map((a) => [a.keyword, a.star, a.value.kind])).toEqual([
      [null, '', 'num'],
      [null, '*', 'name'],
      ['key', '', 'call'],
      [null, '**', 'name'],
    ]);
  });

  it('spans lines and treats method chains on strings as unnamed callees', () => {
    const o = scanPython('x = f(\n    1,\n    2,\n)\ny = "a,b".split(",")\n');
    expect(o.calls[0]).toMatchObject({ callee: 'f', line: 1, endLine: 4 });
    expect(o.calls[1]).toMatchObject({ callee: '', line: 5 });
  });

  it('records inner calls of operator expressions', () => {
    const o = scanPython('urlpatterns = [path("a", v)] + static(prefix, document_root=root)\nz = f"+{x}" if x else ""\n');
    expect(o.calls.map((c) => c.callee)).toEqual(['path', 'static']);
    expect(o.assignments[0]!.value).toMatchObject({ kind: 'other' });
    expect(o.assignments[1]!.value).toMatchObject({ kind: 'other' });
  });
});

describe('scanPython literals', () => {
  it('parses the CELERY_BEAT_SCHEDULE dict with crontab call args', () => {
    const o = scanPython(SETTINGS);
    const a = o.assignments.find((x) => x.targets[0] === 'CELERY_BEAT_SCHEDULE')!;
    expect(a.op).toBe('=');
    const dict = a.value!;
    if (dict.kind !== 'dict') throw new Error('not a dict');
    expect(dict.entries.map((e) => (e.key?.kind === 'str' ? e.key.value : null))).toEqual(['weekly-report', 'cleanup']);
    const weekly = dict.entries[0]!.value;
    if (weekly.kind !== 'dict') throw new Error('not a dict');
    const sched = weekly.entries[1]!.value;
    const cron = asCall(sched);
    expect(cron.callee).toBe('crontab');
    expect(cron.args.map((x) => [x.keyword, x.value.kind === 'num' ? x.value.value : null])).toEqual([
      ['minute', '0'],
      ['hour', '7'],
      ['day_of_week', '1'],
    ]);
    const cleanup = dict.entries[1]!.value;
    if (cleanup.kind !== 'dict') throw new Error('not a dict');
    expect(cleanup.entries[1]!.value).toEqual({ kind: 'num', value: '300', line: 12 });
  });

  it('handles seq, sets, spreads, adjacent strings and assignment forms', () => {
    const o = scanPython(
      [
        'A = ("x" "y")',
        'B = [1, 2,]',
        'C = {**base, "k": v}',
        'D = {1, 2}',
        'E: int',
        'F: int = 3',
        'app.conf.beat_schedule = {}',
        'G += 1',
        'H -= 1',
        'a = b = 5',
        'x, y = 1, 2',
        'z[0] = 1',
      ].join('\n'),
    );
    expect(o.assignments.map((a) => [a.targets, a.op, a.value?.kind ?? null])).toEqual([
      [['A'], '=', 'str'],
      [['B'], '=', 'seq'],
      [['C'], '=', 'dict'],
      [['D'], '=', 'seq'],
      [['E'], ':', null],
      [['F'], ':', 'num'],
      [['app.conf.beat_schedule'], '=', 'dict'],
      [['G'], '+=', 'num'],
      [['a', 'b'], '=', 'num'],
    ]);
    expect(o.assignments[0]!.value).toEqual({ kind: 'str', value: 'xy', line: 1 });
    const c = o.assignments[2]!.value as Extract<PyExpr, { kind: 'dict' }>;
    expect(c.entries.map((e) => e.key === null)).toEqual([true, false]);
  });

  it('keeps string prefixes, escapes and triple quotes out of the names', () => {
    const o = scanPython(String.raw`s = rb"\d+" + u'it\'s' + """multi
line foo(bar)""" + f"{baz}"  # trailing foo()
`);
    expect(o.calls).toEqual([]);
    expect(uses(o)).toEqual([]);
    const s = scanPython(`v = 'it\\'s'\nw = "a\\\\b"`);
    expect(s.assignments.map((a) => (a.value?.kind === 'str' ? a.value.value : null))).toEqual(["it's", 'a\\b']);
  });
});

describe('scanPython nameUses', () => {
  it('excludes def/class names, params, kwarg names, assignment targets and import tokens', () => {
    const o = scanPython(
      [
        'import os',
        'from pkg import Thing',
        'class Foo(Base):',
        '    attr = 1',
        'def bar(param, other=default_val, *args, kw: Ann = None):',
        '    global gv',
        '    local = compute(key=value)',
        '    self.x = 1',
        '    a, b = pair',
        '    return local',
      ].join('\n'),
    );
    expect(uses(o)).toEqual(['Base', 'default_val', 'Ann', 'compute()', 'value', 'pair', 'local']);
  });

  it('includes serializer_class values, base classes, decorators and call arguments', () => {
    const o = scanPython(VIEWS);
    const u = uses(o);
    expect(u).toContain('ContactSerializer');
    expect(u).toContain('viewsets.ModelViewSet');
    expect(u).toContain('api_view()');
    expect(u).toContain('action()');
    expect(u).toContain('phone.normalize_phone()');
    expect(u).not.toContain('serializer_class');
    expect(u).not.toContain('queryset');
    const urls = uses(scanPython(URLS));
    expect(urls).toContain('views.contact_list');
    expect(urls).toContain('views.ContactViewSet');
    expect(urls).toContain('router.register()');
    expect(urls).toContain('router.urls');
    expect(urls).not.toContain('urlpatterns');
    const roots = uses(scanPython(ROOT_URLS));
    expect(roots).toContain('HistoryListView.as_view()');
    expect(roots).toContain('admin.site.urls');
  });

  it('records lambda bodies, comprehensions and conditionals', () => {
    const o = scanPython('f = lambda p, y=dflt: use(p)\nz = [conv(i) for i in items if ok(i)]\nq = a if b else c\n');
    expect(uses(o)).toEqual(expect.arrayContaining(['dflt', 'use()', 'conv()', 'items', 'ok()', 'a', 'b', 'c']));
  });

  it('parses the remaining fixture files', () => {
    const o = scanPython(PHONE);
    expect(o.functions.map((f) => f.name)).toEqual(['_digits', 'normalize_phone']);
    expect(o.assignments.map((a) => a.targets[0])).toEqual(['_NON_DIGITS']);
    const ser = scanPython(SERIALIZERS);
    expect(ser.classes[0]!.methods.map((m) => m.name)).toEqual(['validate_phone']);
    expect(uses(ser)).toContain('normalize_phone()');
    const tasks = scanPython(TASKS);
    expect(tasks.functions.map((f) => [f.name, f.decorators.length])).toEqual([
      ['send_weekly_report', 1],
      ['cleanup', 1],
    ]);
    const mig = scanPython(MIGRATION);
    expect(mig.classes[0]!.name).toBe('Migration');
    const manage = scanPython(MANAGE);
    expect(manage.imports.map((i) => i.module)).toEqual(['os', 'sys', 'django.core.management']);
  });
});

describe('scanPython robustness', () => {
  it.each(['def (', "x = '''", '(((( ', 'class', '@', 'f(', 'x = [1, 2', 'lambda', 'a if', 'for', '}}}', 'from', 'import', 'print >>f, x', 'x := 1', "'abc"])(
    'does not throw on %j',
    (src) => {
      expect(() => scanPython(src)).not.toThrow();
    },
  );

  it('recovers at EOF on unterminated brackets and strings', () => {
    const o = scanPython('import a\nx = foo(1,\n  bar(2\n');
    expect(o.imports).toHaveLength(1);
    expect(o.calls.map((c) => c.callee)).toEqual(['foo', 'bar']);
  });

  it('survives very deep nesting', () => {
    const o = scanPython('x = ' + '('.repeat(5000) + '1' + ')'.repeat(5000) + '\ny = ' + 'not '.repeat(5000) + 'z\n');
    expect(o).toBeDefined();
  });

  it('never throws over random slices of the fixture sources', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 50; i++) {
      const src = SOURCES[rnd(SOURCES.length)]!;
      const a = rnd(src.length);
      const b = a + rnd(src.length - a + 1);
      expect(() => scanPython(src.slice(a, b))).not.toThrow();
    }
  });

  it('scans a 400 KB synthetic file in under a second', () => {
    const chunk = VIEWS + URLS + SERIALIZERS;
    const src = chunk.repeat(Math.ceil(400_000 / chunk.length));
    const t0 = performance.now();
    const o = scanPython(src);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(o.classes.length).toBeGreaterThan(100);
  });

  it('handles CRLF, tabs and a BOM', () => {
    const o = scanPython('\uFEFFdef a():\r\n\treturn 1\r\n\r\ndef b():\r\n\treturn 2\r\n');
    expect(o.functions.map((f) => [f.name, f.line, f.endLine])).toEqual([
      ['a', 1, 2],
      ['b', 4, 5],
    ]);
  });
});
