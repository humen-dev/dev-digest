import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { attributeFacts, handlerHead } from '../src/modules/blast/domain/handler-attribution.js';
import { buildBlastRadius } from '../src/modules/blast/domain/build-blast-radius.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';

const OPTS = { maxCallersPerSymbol: 20, bfsDepth: 2, degraded: false, reason: null } as const;

const row = (file: string, symbol: string, via: string, line: number, scopes?: string[]): BlastCallerRow => ({
  file,
  symbol,
  viaSymbol: via,
  line,
  rank: 0,
  ...(scopes ? { scopes } : {}),
});

describe('handlerHead', () => {
  it('returns the text before the first dot', () => {
    expect(handlerHead('ContactsViewSet.export')).toBe('ContactsViewSet');
    expect(handlerHead('contacts')).toBe('contacts');
  });
});

describe('attributeFacts', () => {
  const facts = ['GET /a', 'GET /b', 'GET /c'];
  const handlers = { 'GET /a': ['ha'], 'GET /b': ['hb'] }; // GET /c unknown

  it.each([
    ['no handler maps → every fact', facts, undefined, 'S', { symbol: 'x', scopes: [] }, facts],
    ['empty handler map → every fact', facts, {}, 'S', { symbol: 'x', scopes: [] }, facts],
    ['own handler + unknown', facts, handlers, 'S', { symbol: 'ha', scopes: ['ha'] }, ['GET /a', 'GET /c']],
    ['direct fact suppresses the fallback', facts, { ...handlers, 'GET /b': ['S'] }, 'S', { symbol: 'x', scopes: [] }, ['GET /b', 'GET /c']],
    ['helper falls back to every known fact', facts, handlers, 'S', { symbol: 'helper', scopes: ['helper'] }, facts],
    ['falls back to [symbol] without scopes', facts, handlers, 'S', { symbol: 'hb' }, ['GET /b', 'GET /c']],
    ['Class.method kept for changed Class', ['GET /x'], { 'GET /x': ['Vs.export'] }, 'Vs', { symbol: 'q', scopes: [] }, ['GET /x']],
    ['Class.method kept for caller inside Class', ['GET /x', 'GET /y'], { 'GET /x': ['Vs.export'], 'GET /y': ['Other'] }, 'S', { symbol: 'Vs', scopes: ['Vs'] }, ['GET /x']],
  ] as const)('%s', (_n, f, h, changed, caller, expected) => {
    expect(attributeFacts(f, h as never, changed, caller as never)).toEqual([...expected].sort());
  });

  it('ignores prototype keys', () => {
    expect(attributeFacts(['constructor'], {}, 'S', { symbol: 'x' })).toEqual(['constructor']);
  });
});

describe('buildBlastRadius per-handler attribution', () => {
  it('contact-book #29: function view vs DRF viewset share one urls.py', () => {
    const endpoints = [
      'ANY /',
      'ANY /api/contacts/',
      'ANY /api/contacts/{pk}/',
      'GET /api/contacts/export/',
      'POST /api/contacts/import_csv/',
      'POST /api/contacts/{pk}/export_to_gsheet/',
    ];
    const source: BlastResult = {
      changedSymbols: [
        { file: 'apps/contacts/views.py', name: 'contacts', kind: 'function' },
        { file: 'apps/contacts/views.py', name: 'ContactsViewSet', kind: 'class' },
      ],
      callers: [
        row('apps/contacts/urls.py', 'urls.py', 'contacts', 11, []),
        row('apps/contacts/urls.py', 'urls.py', 'ContactsViewSet', 7, []),
      ],
      impactedEndpoints: endpoints,
      factsByFile: {
        'apps/contacts/urls.py': {
          endpoints,
          crons: [],
          endpointHandlers: {
            'ANY /': ['contacts'],
            'ANY /api/contacts/': ['ContactsViewSet'],
            'ANY /api/contacts/{pk}/': ['ContactsViewSet'],
            'GET /api/contacts/export/': ['ContactsViewSet.export'],
            'POST /api/contacts/import_csv/': ['ContactsViewSet.import_csv'],
            'POST /api/contacts/{pk}/export_to_gsheet/': ['ContactsViewSet.export_to_gsheet'],
          },
        },
      },
    };
    const out = buildBlastRadius(source, OPTS);
    const by = Object.fromEntries(out.downstream.map((d) => [d.symbol, d]));
    expect(by['contacts']!.endpoints_affected).toEqual(['ANY /']);
    expect(by['ContactsViewSet']!.endpoints_affected).toEqual(endpoints.slice(1));
    expect(out.unattributed_endpoints).toEqual([]);
    expect(out.stats.endpoints).toBe(6);
    expect(BlastRadiusResponse.parse(out)).toEqual(out);
  });

  describe('blast-radius-demo #1', () => {
    const facts: NonNullable<BlastResult['factsByFile']> = {
      'src/routes/invoices.ts': {
        endpoints: ['GET /api/invoices/tax', 'POST /api/invoices'],
        crons: [],
        endpointHandlers: { 'POST /api/invoices': ['createInvoice'], 'GET /api/invoices/tax': ['previewTax'] },
      },
      'src/routes/orders.ts': {
        endpoints: ['GET /api/orders', 'GET /api/orders/:id'],
        crons: [],
        endpointHandlers: { 'GET /api/orders': ['listOrders'], 'GET /api/orders/:id': ['getOrder'] },
      },
      'src/jobs/nightly-report.ts': {
        endpoints: [],
        crons: ['0 2 * * *'],
        cronHandlers: { '0 2 * * *': ['runNightlyReport'] },
      },
    };
    const allEndpoints = ['GET /api/invoices/tax', 'GET /api/orders', 'GET /api/orders/:id', 'POST /api/invoices'];
    const fm = (file: string, name: string) => row(file, name, 'formatMoney', 3, [name]);
    const rc = (file: string, name: string) => row(file, name, 'roundCents', 4, [name]);

    it('lists per-handler endpoints for both changed helpers', () => {
      const out = buildBlastRadius(
        {
          changedSymbols: [
            { file: 'src/lib/money.ts', name: 'formatMoney', kind: 'function' },
            { file: 'src/lib/money.ts', name: 'roundCents', kind: 'function' },
          ],
          callers: [
            fm('src/routes/orders.ts', 'listOrders'),
            fm('src/routes/orders.ts', 'getOrder'),
            fm('src/routes/invoices.ts', 'createInvoice'),
            rc('src/routes/invoices.ts', 'previewTax'),
            fm('src/jobs/nightly-report.ts', 'runNightlyReport'),
            rc('src/jobs/nightly-report.ts', 'runNightlyReport'),
          ],
          impactedEndpoints: allEndpoints,
          factsByFile: facts,
        },
        OPTS,
      );
      const by = Object.fromEntries(out.downstream.map((d) => [d.symbol, d]));
      expect(by['formatMoney']!.endpoints_affected).toEqual(['GET /api/orders', 'GET /api/orders/:id', 'POST /api/invoices']);
      expect(by['formatMoney']!.crons_affected).toEqual(['0 2 * * *']);
      expect(by['roundCents']!.endpoints_affected).toEqual(['GET /api/invoices/tax']);
      expect(by['roundCents']!.crons_affected).toEqual(['0 2 * * *']);
      const cf = Object.fromEntries(out.caller_facts!.map((c) => [c.name, c.endpoints]));
      expect(cf['createInvoice']).toEqual(['POST /api/invoices']);
      expect(cf['previewTax']).toEqual(['GET /api/invoices/tax']);
      expect(out.caller_facts!.map((c) => `${c.file}|${c.name}`)).toEqual(
        [...out.caller_facts!.map((c) => `${c.file}|${c.name}`)].sort(),
      );
      // raw per-file facts are untouched
      expect(out.caller_file_facts['src/routes/invoices.ts']!.endpoints).toEqual(['GET /api/invoices/tax', 'POST /api/invoices']);
    });

    it('drops a refuted endpoint from downstream and unattributed when only formatMoney changed', () => {
      const out = buildBlastRadius(
        {
          changedSymbols: [{ file: 'src/lib/money.ts', name: 'formatMoney', kind: 'function' }],
          callers: [
            fm('src/routes/orders.ts', 'listOrders'),
            fm('src/routes/orders.ts', 'getOrder'),
            fm('src/routes/invoices.ts', 'createInvoice'),
          ],
          impactedEndpoints: allEndpoints,
          factsByFile: facts,
        },
        OPTS,
      );
      expect(out.downstream[0]!.endpoints_affected).not.toContain('GET /api/invoices/tax');
      expect(out.unattributed_endpoints).toEqual([]);
      expect(out.stats.endpoints).toBe(3);
    });
  });

  it('keeps today’s output when there are no handler maps', () => {
    const out = buildBlastRadius(
      {
        changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
        callers: [row('src/a.ts', 'a', 'helper', 1, ['a']), row('src/b.ts', 'b', 'helper', 1)],
        impactedEndpoints: ['GET /a', 'POST /b'],
        factsByFile: {
          'src/a.ts': { endpoints: ['POST /b', 'GET /a'], crons: ['nightly'] },
          'src/b.ts': { endpoints: ['GET /a'], crons: [] },
        },
      },
      OPTS,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(out.caller_facts).toEqual([
      { name: 'a', file: 'src/a.ts', endpoints: ['GET /a', 'POST /b'], crons: ['nightly'] },
      { name: 'b', file: 'src/b.ts', endpoints: ['GET /a'], crons: [] },
    ]);
  });

  it('keeps an endpoint of a file whose caller rows were capped in unattributed_endpoints', () => {
    const callers = [
      ...Array.from({ length: 2 }, (_, i) => ({ ...row(`src/keep${i}.ts`, 'k', 'helper', 1), rank: 5 })),
      row('src/capped.ts', 'c', 'helper', 1, ['c']),
    ];
    const out = buildBlastRadius(
      {
        changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
        callers,
        impactedEndpoints: ['GET /capped'],
        factsByFile: {
          'src/capped.ts': { endpoints: ['GET /capped'], crons: [], endpointHandlers: { 'GET /capped': ['other'] } },
          'src/keep0.ts': { endpoints: [], crons: [] },
        },
      },
      { ...OPTS, maxCallersPerSymbol: 2 },
    );
    expect(out.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/keep0.ts', 'src/keep1.ts']);
    expect(out.unattributed_endpoints).toEqual(['GET /capped']);
  });

  it('filters endpoints and crons independently', () => {
    const out = buildBlastRadius(
      {
        changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
        callers: [row('src/a.ts', 'ha', 'helper', 1, ['ha'])],
        impactedEndpoints: [],
        factsByFile: {
          'src/a.ts': {
            endpoints: ['GET /a', 'GET /b'],
            crons: ['c1', 'c2'],
            endpointHandlers: { 'GET /a': ['ha'], 'GET /b': ['hb'] },
            // crons: no handler info → all kept
          },
        },
      },
      OPTS,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /a']);
    expect(out.downstream[0]!.crons_affected).toEqual(['c1', 'c2']);
  });
});
