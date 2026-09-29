import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractReferences,
  extractEndpoints,
  extractCrons,
  extractEndpointFacts,
  extractCronFacts,
  foldFactHandlers,
} from '../src/adapters/codeindex/extract.js';

/**
 * A3 — unit tests for the enhanced TS/JS symbol/reference extractor (L04).
 * Pure (no DB/network) — the core of blast-radius accuracy.
 */
describe('extractSymbols', () => {
  it('finds functions, arrows, classes, methods, interfaces, types', () => {
    const src = `
export function rateLimit(req) { return true; }
const helper = (x) => x + 1;
export const compute = async (n: number) => n * 2;
export class Bucket {
  refill(now: number) { return now; }
  static make() { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
`;
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('rateLimit');
    expect(names).toContain('helper');
    expect(names).toContain('compute');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill'); // class method (bare)
    expect(names).toContain('Bucket.refill'); // class method (qualified)
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(syms.find((s) => s.name === 'Bucket')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
  });

  it('ignores keywords and comment lines', () => {
    const src = `
// function notReal(x) {}
/* class AlsoNot {} */
if (x) { doThing(); }
`;
    const syms = extractSymbols(src);
    expect(syms.map((s) => s.name)).not.toContain('notReal');
    expect(syms.map((s) => s.name)).not.toContain('AlsoNot');
    expect(syms.map((s) => s.name)).not.toContain('if');
  });
});

describe('extractReferences (downstream callers)', () => {
  it('finds call sites and excludes the declaration', () => {
    const caller = `
import { rateLimit } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  return 200;
}
`;
    const refs = extractReferences(caller, 'rateLimit');
    // exactly the call site on the if-line, NOT the import line
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(4);
  });

  it('matches member calls, new, and JSX usage', () => {
    expect(extractReferences('obj.compute(1)', 'compute').length).toBe(1);
    expect(extractReferences('const b = new Bucket()', 'Bucket').length).toBe(1);
    expect(extractReferences('return <Widget id={1} />', 'Widget').length).toBe(1);
  });

  it('does not count the declaration line as a reference', () => {
    const decl = `export function rateLimit(req) { return true; }`;
    expect(extractReferences(decl, 'rateLimit').length).toBe(0);
  });
});

describe('extractEndpoints / extractCrons', () => {
  it('detects fastify/express route registrations', () => {
    const src = `
app.get('/users', handler);
router.post("/users/:id", update);
app.get<{ Params: { id: string } }>('/pulls/:id/blast', blast);
`;
    const eps = extractEndpoints(src);
    expect(eps).toContain('GET /users');
    expect(eps).toContain('POST /users/:id');
    expect(eps).toContain('GET /pulls/:id/blast');
  });

  it('detects cron expressions and background job kinds', () => {
    const src = `
cron.schedule('*/5 * * * *', poll);
jobs.register('poll_repo', handler);
`;
    const crons = extractCrons(src);
    expect(crons.some((c) => c.includes('*/5'))).toBe(true);
    expect(crons).toContain('job:poll_repo');
  });
});

describe('handler capture (extractEndpointFacts / extractCronFacts)', () => {
  it('captures a trailing plain-identifier handler', () => {
    expect(extractEndpointFacts(`router.get('/api/orders', listOrders);`)).toEqual([
      { fact: 'GET /api/orders', handler: 'listOrders' },
    ]);
    expect(extractEndpointFacts(`router.post('/x', auth, createInvoice)`)).toEqual([
      { fact: 'POST /x', handler: 'createInvoice' },
    ]);
    expect(extractCronFacts(`cron.schedule('0 2 * * *', runNightlyReport);`)).toEqual([
      { fact: '0 2 * * *', handler: 'runNightlyReport' },
    ]);
    expect(extractCronFacts(`jobs.register('poll_repo', handler)`)).toEqual([
      { fact: 'job:poll_repo', handler: 'handler' },
    ]);
    // enqueue's trailing argument is a payload, not a handler → handler unknown.
    expect(extractCronFacts(`this.jobs.enqueue(ws, 'index_repo', payload);`)).toEqual([
      { fact: 'job:index_repo', handler: null },
    ]);
    expect(
      extractEndpointFacts(`app.route({ method: 'GET', url: '/r', handler: getR, })`),
    ).toEqual([{ fact: 'GET /r', handler: 'getR' }]);
  });

  it('leaves the handler null for inline arrows, wrappers, members, multi-line and literals', () => {
    for (const line of [
      `app.get('/x', async (req) => {`,
      `app.get('/x', wrap(h));`,
      `app.get('/x', ctrl.list);`,
      `app.get('/x',`,
      `app.get('/x', undefined);`,
    ]) {
      expect(extractEndpointFacts(line)).toEqual([{ fact: 'GET /x', handler: null }]);
    }
  });

  it('ignores a trailing line comment when reading the handler', () => {
    expect(extractEndpointFacts(`app.get('/x', h); // registers h`)[0]!.handler).toBe('h');
  });
});

describe('foldFactHandlers', () => {
  it('drops the key when any registration has an unknown handler; merges distinct handlers', () => {
    expect(
      foldFactHandlers([
        { fact: 'GET /a', handler: 'x' },
        { fact: 'GET /a', handler: null },
      ]),
    ).toEqual({ facts: ['GET /a'], handlers: {} });
    expect(
      foldFactHandlers([
        { fact: 'GET /b', handler: 'y' },
        { fact: 'GET /b', handler: 'x' },
        { fact: 'GET /a', handler: 'z' },
      ]),
    ).toEqual({ facts: ['GET /a', 'GET /b'], handlers: { 'GET /a': ['z'], 'GET /b': ['x', 'y'] } });
  });
});
