import { describe, it, expect } from 'vitest';
import { scanPython } from '../src/adapters/python/scan.js';
import {
  attributePythonFacts,
  collectViewInfo,
  extractPythonRegistrations,
} from '../src/adapters/python/facts.js';
import type {
  PyFactsResolver,
  PyFileRegistrations,
  PyResolved,
  PyTarget,
  PyViewInfo,
} from '../src/adapters/python/types.js';

type Sources = Record<string, string>;
/** `"<fromFile>|<dotted>"` -> resolved target. */
type ResolverMap = Record<string, PyResolved>;

function fakeResolver(map: ResolverMap): PyFactsResolver {
  return {
    resolveTarget(fromFile: string, target: PyTarget): PyResolved | null {
      if (target.kind === 'local') return { file: fromFile, name: target.name };
      return map[`${fromFile}|${target.dotted}`] ?? null;
    },
  };
}

function run(sources: Sources, map: ResolverMap = {}) {
  const regs: PyFileRegistrations[] = [];
  const viewInfo = new Map<string, Record<string, PyViewInfo>>();
  for (const [file, src] of Object.entries(sources)) {
    const outline = scanPython(src);
    regs.push(extractPythonRegistrations(file, outline));
    viewInfo.set(file, collectViewInfo(outline));
  }
  return attributePythonFacts(regs, viewInfo, fakeResolver(map));
}

const rowOf = (rows: ReturnType<typeof run>, file: string) => rows.find((r) => r.filePath === file);
const lines = (...l: string[]) => l.join('\n') + '\n';

// ------------------------------------------------------------ fixture 3.5 --

const FIXTURE: Sources = {
  'config/settings.py': lines(
    'from celery.schedules import crontab',
    '',
    'ROOT_URLCONF = "config.urls"',
    '',
    'CELERY_BEAT_SCHEDULE = {',
    '    "weekly-report": {',
    '        "task": "apps.reports.tasks.send_weekly_report",',
    '        "schedule": crontab(minute=0, hour=7, day_of_week=1),',
    '    },',
    '    "cleanup": {',
    '        "task": "apps.reports.tasks.cleanup",',
    '        "schedule": 300,',
    '    },',
    '}',
  ),
  'config/urls.py': lines(
    'from django.contrib import admin',
    'from django.urls import include, path',
    '',
    'from apps.history.views import HistoryListView',
    '',
    'urlpatterns = [',
    '    path("admin/", admin.site.urls),',
    '    path("", include("apps.contacts.urls")),',
    '    path("api/history/", HistoryListView.as_view(), name="history"),',
    ']',
  ),
  'apps/contacts/views.py': lines(
    'from django.shortcuts import render',
    'from rest_framework import viewsets',
    'from rest_framework.decorators import action, api_view',
    'from rest_framework.response import Response',
    '',
    'from apps.tools import phone',
    '',
    'from .models import Contact',
    'from .serializers import ContactSerializer',
    '',
    '',
    'def contact_list(request):',
    '    return render(request, "contacts/list.html", {"contacts": Contact.objects.all()})',
    '',
    '',
    '@api_view(["GET", "POST"])',
    'def contact_lookup(request):',
    '    return Response({"phone": phone.normalize_phone(request.GET.get("q"))})',
    '',
    '',
    'class ContactViewSet(viewsets.ModelViewSet):',
    '    queryset = Contact.objects.all()',
    '    serializer_class = ContactSerializer',
    '',
    '    @action(detail=False, methods=["post"], url_path="import_csv")',
    '    def import_csv(self, request):',
    '        rows = [phone.normalize_phone(r) for r in request.data.get("phones", [])]',
    '        return Response({"imported": len(rows)})',
  ),
  'apps/contacts/urls.py': lines(
    'from django.urls import include, path',
    'from rest_framework.routers import DefaultRouter',
    '',
    'from . import views',
    '',
    'router = DefaultRouter()',
    'router.register(r"contacts", views.ContactViewSet, basename="contact")',
    '',
    'urlpatterns = [',
    '    path("", views.contact_list, name="contact-list"),',
    '    path("lookup/", views.contact_lookup, name="contact-lookup"),',
    '    path("api/", include(router.urls)),',
    ']',
  ),
  'apps/history/views.py': lines(
    'from rest_framework import generics',
    'from rest_framework.response import Response',
    '',
    '',
    'class HistoryListView(generics.ListAPIView):',
    '    def get(self, request):',
    '        return Response([])',
  ),
  'apps/reports/tasks.py': lines(
    'from celery import shared_task',
    '',
    'from apps.tools.phone import normalize_phone',
    '',
    '',
    '@shared_task',
    'def send_weekly_report():',
    '    return normalize_phone("+1 555 0100")',
    '',
    '',
    '@shared_task(name="reports.cleanup")',
    'def cleanup():',
    '    return None',
  ),
};

const FIXTURE_RESOLVER: ResolverMap = {
  'config/settings.py|apps.reports.tasks.send_weekly_report': {
    file: 'apps/reports/tasks.py',
    name: 'send_weekly_report',
  },
  'config/settings.py|apps.reports.tasks.cleanup': { file: 'apps/reports/tasks.py', name: 'cleanup' },
  'config/urls.py|apps.contacts.urls': { file: 'apps/contacts/urls.py', name: '' },
  'config/urls.py|HistoryListView': { file: 'apps/history/views.py', name: 'HistoryListView' },
  'apps/contacts/urls.py|views.contact_list': { file: 'apps/contacts/views.py', name: 'contact_list' },
  'apps/contacts/urls.py|views.contact_lookup': { file: 'apps/contacts/views.py', name: 'contact_lookup' },
  'apps/contacts/urls.py|views.ContactViewSet': { file: 'apps/contacts/views.py', name: 'ContactViewSet' },
};

describe('django-mini fixture (plan 3.5)', () => {
  it('reproduces the expected fact table exactly', () => {
    const rows = run(FIXTURE, FIXTURE_RESOLVER);
    const contacts = [
      'ANY /',
      'ANY /api/contacts/',
      'ANY /api/contacts/{pk}/',
      'GET /lookup/',
      'POST /api/contacts/import_csv/',
      'POST /lookup/',
    ];
    const settingsCrons = ['0 7 * * 1 (send_weekly_report)', 'every 300s (cleanup)'];
    expect(rows).toEqual([
      { filePath: 'apps/contacts/urls.py', endpoints: contacts, crons: [] },
      { filePath: 'apps/contacts/views.py', endpoints: contacts, crons: [] },
      { filePath: 'apps/history/views.py', endpoints: ['GET /api/history/'], crons: [] },
      {
        filePath: 'apps/reports/tasks.py',
        endpoints: [],
        crons: [...settingsCrons, 'job:reports.cleanup', 'job:send_weekly_report'],
      },
      { filePath: 'config/settings.py', endpoints: [], crons: settingsCrons },
      { filePath: 'config/urls.py', endpoints: ['GET /api/history/'], crons: [] },
    ]);
  });
});

// -------------------------------------------------------------- endpoints --

describe('Django recognisers', () => {
  it('normalises re_path patterns and composes include prefixes', () => {
    const rows = run(
      {
        'root/urls.py': lines(
          'from django.urls import include, re_path',
          "urlpatterns = [re_path(r'^api/', include('app.urls'))]",
        ),
        'app/urls.py': lines(
          'from django.urls import re_path',
          'from . import views',
          "urlpatterns = [re_path(r'^ckeditor/upload/*$', views.Up.as_view())]",
        ),
        'app/views.py': lines('class Up:', '    def post(self, r): ...'),
      },
      {
        'root/urls.py|app.urls': { file: 'app/urls.py', name: '' },
        'app/urls.py|views.Up': { file: 'app/views.py', name: 'Up' },
      },
    );
    expect(rowOf(rows, 'app/urls.py')?.endpoints).toEqual(['POST /api/ckeditor/upload/*']);
  });

  it('handles the "[...] + static(...)" and "urlpatterns += static(...)" shapes', () => {
    const rows = run({
      'a/urls.py': lines(
        'from django.urls import path',
        'from django.conf.urls.static import static',
        "urlpatterns = ([path('x/', v)] + static('/m', document_root='r'))",
      ),
      'b/urls.py': lines(
        'from django.urls import path',
        "urlpatterns = [path('y/', v)]",
        'if settings.DEBUG:',
        "    urlpatterns += static('/m', document_root='r')",
      ),
    });
    expect(rowOf(rows, 'a/urls.py')?.endpoints).toEqual(['ANY /x/']);
    expect(rowOf(rows, 'b/urls.py')?.endpoints).toEqual(['ANY /y/']);
  });

  it('emits local targets for views defined in the same file and infers methods', () => {
    const rows = run({
      'u.py': lines(
        'from django.urls import path',
        'from django.views.decorators.http import require_POST, require_http_methods, require_safe',
        '',
        '@require_POST',
        'def a(r): ...',
        '',
        '@require_http_methods(["PUT", "get"])',
        'def b(r): ...',
        '',
        '@require_safe',
        'def c(r): ...',
        '',
        "urlpatterns = [path('a/', a), path('b/', b), path('c/', c)]",
      ),
    });
    expect(rowOf(rows, 'u.py')?.endpoints).toEqual(['GET /b/', 'GET /c/', 'HEAD /c/', 'POST /a/', 'PUT /b/']);
  });

  it('gives an included urlconf one variant per include site and terminates on cycles', () => {
    const rows = run(
      {
        'a.py': lines(
          'from django.urls import include, path',
          "urlpatterns = [path('b/', include('b')), path('own/', v)]",
        ),
        'b.py': lines(
          'from django.urls import include, path',
          "urlpatterns = [path('a/', include('a')), path('leaf/', v)]",
        ),
        'c.py': lines(
          'from django.urls import include, path',
          "urlpatterns = [path('one/', include('leaf')), path('two/', include('leaf'))]",
        ),
        'leaf.py': lines('from django.urls import path', "urlpatterns = [path('z/', v)]"),
      },
      {
        'a.py|b': { file: 'b.py', name: '' },
        'b.py|a': { file: 'a.py', name: '' },
        'c.py|leaf': { file: 'leaf.py', name: '' },
      },
    );
    expect(rowOf(rows, 'leaf.py')?.endpoints).toEqual(['ANY /one/z/', 'ANY /two/z/']);
    expect(rowOf(rows, 'a.py')?.endpoints).toEqual(['ANY /own/']);
    expect(rowOf(rows, 'b.py')?.endpoints).toContain('ANY /b/leaf/');
  });

  it('adds DRF @action routes (detail=True uses {pk}) for "urlpatterns = router.urls"', () => {
    const rows = run(
      {
        'urls.py': lines(
          'from rest_framework import routers',
          'from . import views',
          'router = routers.SimpleRouter()',
          "router.register('items', views.ItemViewSet)",
          'urlpatterns = router.urls',
        ),
        'views.py': lines(
          'class ItemViewSet:',
          "    @action(detail=True, methods=['post', 'put'])",
          '    def star(self, r): ...',
          '    @action(detail=False)',
          '    def recent(self, r): ...',
        ),
      },
      { 'urls.py|views.ItemViewSet': { file: 'views.py', name: 'ItemViewSet' } },
    );
    expect(rowOf(rows, 'views.py')?.endpoints).toEqual([
      'ANY /items/',
      'ANY /items/{pk}/',
      'GET /items/recent/',
      'POST /items/{pk}/star/',
      'PUT /items/{pk}/star/',
    ]);
  });

  it('negatives: path() not imported from django, os.path.join, admin.site.urls', () => {
    const rows = run({
      'x.py': lines('import os', 'from mylib import path', "p = path('a/', v)", "q = os.path.join('a', 'b')"),
      'y.py': lines(
        'from django.contrib import admin',
        'from django.urls import path',
        "urlpatterns = [path('admin/', admin.site.urls)]",
      ),
    });
    expect(rows).toEqual([]);
  });
});

describe('Flask recogniser', () => {
  it('reads Blueprint url_prefix, methods= and defaults to GET', () => {
    const rows = run({
      'bp.py': lines(
        'from flask import Blueprint',
        "bp = Blueprint('x', __name__, url_prefix='/inv')",
        '',
        "@bp.route('/list')",
        'def lst(): ...',
        '',
        "@bp.route('/save', methods=['GET', 'POST'])",
        'def save(): ...',
        '',
        "@bp.delete('/<int:id>')",
        'def rm(id): ...',
      ),
    });
    expect(rowOf(rows, 'bp.py')?.endpoints).toEqual([
      'DELETE /inv/<int:id>',
      'GET /inv/list',
      'GET /inv/save',
      'POST /inv/save',
    ]);
  });

  it('negative: the same decorators without a flask import produce nothing', () => {
    expect(run({ 'n.py': lines("@bp.route('/x')", 'def f(): ...') })).toEqual([]);
  });
});

describe('FastAPI recogniser', () => {
  it('reads APIRouter prefix, verb decorators and api_route', () => {
    const rows = run({
      'api.py': lines(
        'from fastapi import APIRouter, FastAPI',
        "router = APIRouter(prefix='/items')",
        'app = FastAPI()',
        '',
        "@router.post('/')",
        'def create(): ...',
        '',
        "@app.api_route('/x', methods=['PUT'])",
        'def x(): ...',
        '',
        "@app.get('/h')",
        'async def h(): ...',
      ),
    });
    expect(rowOf(rows, 'api.py')?.endpoints).toEqual(['GET /h', 'POST /items/', 'PUT /x']);
  });

  it('negative: no fastapi/flask import gives no facts', () => {
    expect(run({ 'n.py': lines("@app.get('/h')", 'def h(): ...') })).toEqual([]);
  });
});

// ------------------------------------------------------------ crons / jobs --

describe('cron and job recognisers', () => {
  it('renders crontab (positional, kwargs, non-literal) and timedelta schedules', () => {
    const rows = run({
      's.py': lines(
        'CELERYBEAT_SCHEDULE = {',
        "  'a': {'task': 'p.t.a', 'schedule': crontab(30, 4, 'mon', 1, 2)},",
        "  'b': {'task': 'p.t.b', 'schedule': crontab(minute=x)},",
        "  'c': {'task': 'p.t.c', 'schedule': timedelta(minutes=15)},",
        "  'd': {'task': 'p.t.d', 'schedule': timedelta(hours=1, minutes=2)},",
        "  'e': {'schedule': solar('sunrise')},",
        '}',
      ),
    });
    expect(rowOf(rows, 's.py')?.crons).toEqual([
      '* * * * * (b)',
      '30 4 1 2 mon (a)',
      'every 15m (c)',
      'every ? (d)',
      'schedule (e)',
    ]);
  });

  it('reads app.conf.update(beat_schedule=...) and add_periodic_task', () => {
    const rows = run(
      {
        'c.py': lines(
          "app.conf.update(beat_schedule={'k': {'task': 'm.run', 'schedule': 5}})",
          '',
          '@app.on_after_configure.connect',
          'def setup(sender, **kw):',
          '    sender.add_periodic_task(10.0, ping.s())',
        ),
        'm.py': lines('def run(): ...'),
      },
      { 'c.py|m.run': { file: 'm.py', name: 'run' } },
    );
    expect(rowOf(rows, 'c.py')?.crons).toEqual(['every 10.0s (ping)', 'every 5s (run)']);
    expect(rowOf(rows, 'm.py')?.crons).toEqual(['every 5s (run)']);
  });

  it('reads APScheduler add_job / scheduled_job and @periodic_task', () => {
    const rows = run({
      'j.py': lines(
        "sched.add_job(job, 'cron', hour=3, minute=0)",
        "sched.add_job(job2, trigger='interval', minutes=5)",
        "sched.add_job(job3, 'date')",
        '',
        "@sched.scheduled_job('interval', seconds=30)",
        'def tick(): ...',
        '',
        "@periodic_task(run_every=crontab(minute='*/5'))",
        'def beat(): ...',
      ),
    });
    expect(rowOf(rows, 'j.py')?.crons).toEqual([
      '*/5 * * * * (beat)',
      '0 3 * * * (job)',
      'every 30s (tick)',
      'every 5m (job2)',
    ]);
  });

  it('reads django-crontab CRONJOBS', () => {
    const rows = run(
      {
        'settings.py': lines('CRONJOBS = [', "    ('*/5 * * * *', 'app.cron.sync'),", ']'),
        'app/cron.py': lines('def sync(): ...'),
      },
      { 'settings.py|app.cron.sync': { file: 'app/cron.py', name: 'sync' } },
    );
    expect(rowOf(rows, 'settings.py')?.crons).toEqual(['*/5 * * * * (sync)']);
    expect(rowOf(rows, 'app/cron.py')?.crons).toEqual(['*/5 * * * * (sync)']);
  });

  it('reads @app.task(name=...) and bare @celery.task jobs; ignores other decorators', () => {
    const rows = run({
      't.py': lines(
        "@app.task(name='invite_member', queue='x')",
        'def invite(): ...',
        '',
        '@celery.task',
        'def plain(): ...',
        '',
        '@other.decorator',
        'def nope(): ...',
      ),
    });
    expect(rowOf(rows, 't.py')?.crons).toEqual(['job:invite_member', 'job:plain']);
  });
});

// ------------------------------------------- rework: positives / negatives --

describe('positive recognisers (rework)', () => {
  it('url() imported from django.conf.urls, @require_GET and @api_view without args', () => {
    const rows = run({
      'u.py': lines(
        'from django.conf.urls import url',
        'from django.views.decorators.http import require_GET',
        'from rest_framework.decorators import api_view',
        '',
        '@require_GET',
        'def a(r): ...',
        '',
        '@api_view',
        'def b(r): ...',
        '',
        '@api_view()',
        'def c(r): ...',
        '',
        "urlpatterns = [url(r'^a/$', a), url(r'^b/$', b), url(r'^c/$', c)]",
      ),
    });
    expect(rowOf(rows, 'u.py')?.endpoints).toEqual(['GET /a/', 'GET /b/', 'GET /c/']);
  });

  it('enables Flask/FastAPI on any module starting with flask/fastapi', () => {
    const rows = run({
      'f.py': lines('import flask_smorest', "@bp.get('/f')", 'def f(): ...'),
      'g.py': lines('from fastapi_users import FastAPIUsers', "@app.post('/g')", 'def g(): ...'),
    });
    expect(rowOf(rows, 'f.py')?.endpoints).toEqual(['GET /f']);
    expect(rowOf(rows, 'g.py')?.endpoints).toEqual(['POST /g']);
  });

  it('reads an annotated CELERY_BEAT_SCHEDULE assignment', () => {
    const rows = run({
      's.py': lines(
        'CELERY_BEAT_SCHEDULE: dict = {',
        "  'a': {'task': 'p.t.a', 'schedule': 7},",
        '}',
      ),
    });
    expect(rowOf(rows, 's.py')?.crons).toEqual(['every 7s (a)']);
  });
});

describe('negative recognisers (rework)', () => {
  it('DRF register on a non-Router variable and a bare-annotated beat name yield nothing', () => {
    const rows = run(
      {
        'urls.py': lines(
          'from django.urls import path',
          'from . import views',
          'r = make_thing()',
          "r.register('items', views.V)",
          'urlpatterns = r.urls',
        ),
        's.py': lines('CELERY_BEAT_SCHEDULE: dict'),
      },
      { 'urls.py|views.V': { file: 'views.py', name: 'V' } },
    );
    expect(rows).toEqual([]);
  });

  it('beat-dict: a dict whose target does not end in beat_schedule is ignored', () => {
    const rows = run({
      's.py': lines("MY_SCHEDULE = {'a': {'task': 'p.t.a', 'schedule': 5}}"),
    });
    expect(rows).toEqual([]);
  });

  it('update(): non-beat kwargs and a bare update() callee are ignored', () => {
    const rows = run({
      'c.py': lines(
        "app.conf.update(other={'k': {'task': 'm.run', 'schedule': 5}})",
        "update(beat_schedule={'k': {'task': 'm.run', 'schedule': 5}})",
      ),
    });
    expect(rows).toEqual([]);
  });

  it('add_periodic_task without an owner, and add_job with an unsupported trigger, are ignored', () => {
    const rows = run({
      'c.py': lines('add_periodic_task(10, ping.s())', "sched.add_job(job, 'date')"),
    });
    expect(rows).toEqual([]);
  });

  it('@periodic_task without run_every and @scheduled_job without an owner or on a date trigger are ignored', () => {
    const rows = run({
      'j.py': lines(
        '@periodic_task',
        'def a(): ...',
        '',
        '@periodic_task(expires=5)',
        'def b(): ...',
        '',
        "@scheduled_job('interval', seconds=30)",
        'def c(): ...',
        '',
        "@sched.scheduled_job('date')",
        'def d(): ...',
      ),
    });
    expect(rows).toEqual([]);
  });

  it('CRONJOBS: a differently named list of tuples is ignored', () => {
    const rows = run({
      'settings.py': lines('OTHER = [', "    ('*/5 * * * *', 'app.cron.sync'),", ']'),
    });
    expect(rows).toEqual([]);
  });

  it('include composition: an unresolvable include adds no prefix to the target urlconf', () => {
    const rows = run({
      'root.py': lines('from django.urls import include, path', "urlpatterns = [path('api/', include('missing.urls'))]"),
      'app/urls.py': lines('from django.urls import path', "urlpatterns = [path('y/', v)]"),
    });
    expect(rowOf(rows, 'app/urls.py')?.endpoints).toEqual(['ANY /y/']);
  });
});
