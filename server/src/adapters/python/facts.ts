/**
 * Python endpoint / cron / job facts (docs/plans/repo-intel-python.md §3.4).
 * Pure: consumes a `PyOutline` (scan.ts output) and a resolver; no fs, no network.
 *
 * Two phases:
 *  - `extractPythonRegistrations` / `collectViewInfo` read ONE file's outline;
 *  - `attributePythonFacts` composes include prefixes across files and renders fact strings.
 */
import type {
  PyArg,
  PyAssignment,
  PyCall,
  PyDecorator,
  PyEndpointReg,
  PyExpr,
  PyFactsResolver,
  PyFactsRow,
  PyFileRegistrations,
  PyFunction,
  PyIncludeReg,
  PyOutline,
  PyResolved,
  PyRouterReg,
  PyTarget,
  PyViewAction,
  PyViewInfo,
} from './types.js';

const DJANGO_MODULES = new Set(['django.urls', 'django.conf.urls']);
const DJANGO_ROUTE_FUNCS = new Set(['path', 're_path', 'url']);
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const VERB_SET: ReadonlySet<string> = new Set(VERBS);
const FLASK_VERB_DECORATORS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const FASTAPI_VERB_DECORATORS = new Set([...FLASK_VERB_DECORATORS, 'options', 'head']);
const CRONTAB_POSITIONAL = ['minute', 'hour', 'day_of_week', 'day_of_month', 'month_of_year'] as const;
const APS_CRON_FIELDS = ['minute', 'hour', 'day', 'month', 'day_of_week'] as const;
const INTERVAL_UNITS: ReadonlyArray<readonly [string, string]> = [
  ['seconds', 's'],
  ['minutes', 'm'],
  ['hours', 'h'],
  ['days', 'd'],
];
const MAX_INCLUDE_DEPTH = 8;
const MAX_VARIANTS_PER_FILE = 32;

// ------------------------------------------------------------ small helpers --

function lastSegment(dotted: string): string {
  const i = dotted.lastIndexOf('.');
  return i < 0 ? dotted : dotted.slice(i + 1);
}

function head(dotted: string): string {
  const i = dotted.indexOf('.');
  return i < 0 ? dotted : dotted.slice(0, i);
}

function positionalArgs(call: PyCall): PyExpr[] {
  const out: PyExpr[] = [];
  for (const a of call.args) if (a.keyword === null && a.star === '') out.push(a.value);
  return out;
}

function kwArg(call: PyCall, keyword: string): PyExpr | undefined {
  return call.args.find((a: PyArg) => a.keyword === keyword)?.value;
}

/** Positional argument `index`, else keyword `keyword`. */
function argOrKw(call: PyCall, index: number, keyword: string): PyExpr | undefined {
  return positionalArgs(call)[index] ?? kwArg(call, keyword);
}

function strValue(e: PyExpr | undefined): string | null {
  return e && e.kind === 'str' ? e.value : null;
}

/** The literal's source text for str and num, else null. */
function literalText(e: PyExpr | undefined): string | null {
  return e && (e.kind === 'str' || e.kind === 'num') ? e.value : null;
}

function strItems(e: PyExpr | undefined): string[] {
  if (!e) return [];
  if (e.kind === 'str') return [e.value];
  if (e.kind !== 'seq') return [];
  const out: string[] = [];
  for (const it of e.items) if (it.kind === 'str') out.push(it.value);
  return out;
}

function verbList(e: PyExpr | undefined): string[] {
  const out = new Set<string>();
  for (const s of strItems(e)) {
    const v = s.toUpperCase();
    if (VERB_SET.has(v)) out.add(v);
  }
  return [...out].sort();
}

function isTrue(e: PyExpr | undefined): boolean {
  return !!e && e.kind === 'name' && e.dotted === 'True';
}

/** The decorator as a call, or (for a bare name) a synthetic argument-less view of it. */
function decoratorCallee(d: PyDecorator): { callee: string; call: PyCall | null } | null {
  if (d.expr.kind === 'call') return { callee: d.expr.callee, call: d.expr };
  if (d.expr.kind === 'name') return { callee: d.expr.dotted, call: null };
  return null;
}

// -------------------------------------------------------- path normalising --

function normFragment(s: string): string {
  let out = s.trim();
  if (out.startsWith('^')) out = out.slice(1);
  if (out.endsWith('$')) out = out.slice(0, -1);
  return out.replace(/^\/+/, '');
}

/** Joins route fragments (§3.4): normalise each, join with '/', collapse '//+', prepend '/'. */
function joinRoute(fragments: readonly string[]): string {
  const parts = fragments.map(normFragment).filter((p) => p !== '');
  return ('/' + parts.join('/')).replace(/\/{2,}/g, '/');
}

/** Like `joinRoute`, but always ends with '/' (DRF router routes). */
function joinRouteDir(fragments: readonly string[]): string {
  const route = joinRoute(fragments);
  return route.endsWith('/') ? route : `${route}/`;
}

// ------------------------------------------------------ extraction: schedule --

function fieldText(e: PyExpr | undefined): string {
  return literalText(e) ?? '*';
}

function renderCrontab(call: PyCall): string {
  const pos = positionalArgs(call);
  const field = (name: (typeof CRONTAB_POSITIONAL)[number], idx: number): string =>
    fieldText(kwArg(call, name) ?? pos[idx]);
  const minute = field('minute', 0);
  const hour = field('hour', 1);
  const dow = field('day_of_week', 2);
  const dom = field('day_of_month', 3);
  const moy = field('month_of_year', 4);
  return `${minute} ${hour} ${dom} ${moy} ${dow}`;
}

function renderTimedelta(call: PyCall): string {
  const present = INTERVAL_UNITS.filter(([kw]) => kwArg(call, kw) !== undefined);
  const only = present.length === 1 ? present[0] : undefined;
  if (!only) return 'every ?';
  const value = kwArg(call, only[0]);
  return value && value.kind === 'num' ? `every ${value.value}${only[1]}` : 'every ?';
}

/** Celery-style schedule expression → rendered schedule. */
function renderSchedule(e: PyExpr | undefined): string {
  if (!e) return 'schedule';
  if (e.kind === 'num') return `every ${e.value}s`;
  if (e.kind === 'call') {
    const last = lastSegment(e.callee);
    if (last === 'crontab') return renderCrontab(e);
    if (last === 'timedelta') return renderTimedelta(e);
  }
  return 'schedule';
}

/** APScheduler trigger name + kwargs → rendered schedule, or null for unsupported triggers. */
function renderApsTrigger(trigger: string | null, call: PyCall): string | null {
  if (trigger === 'cron') return APS_CRON_FIELDS.map((f) => fieldText(kwArg(call, f))).join(' ');
  if (trigger === 'interval') return renderTimedelta(call);
  return null;
}

// -------------------------------------------------- extraction: registrations --

interface ImportFacts {
  /** Local name → original name for `from django.urls|django.conf.urls import …`. */
  django: Map<string, string>;
  flask: boolean;
  fastapi: boolean;
}

function readImports(outline: PyOutline): ImportFacts {
  const facts: ImportFacts = { django: new Map(), flask: false, fastapi: false };
  for (const imp of outline.imports) {
    if (imp.level > 0) continue;
    if (imp.module === 'flask' || imp.module.startsWith('flask.')) facts.flask = true;
    if (imp.module === 'fastapi' || imp.module.startsWith('fastapi.')) facts.fastapi = true;
    if (imp.kind === 'from' && DJANGO_MODULES.has(imp.module)) {
      for (const n of imp.names) facts.django.set(n.alias ?? n.name, n.name);
    }
  }
  return facts;
}

function localNames(outline: PyOutline): Set<string> {
  const out = new Set<string>();
  for (const f of outline.functions) out.add(f.name);
  for (const c of outline.classes) out.add(c.name);
  return out;
}

/** `expr` targets whose head is defined in this very file become `local` targets. */
function exprTarget(dotted: string, locals: ReadonlySet<string>): PyTarget {
  const h = head(dotted);
  return locals.has(h) ? { kind: 'local', name: h } : { kind: 'expr', dotted };
}

function stripCallSuffix(dotted: string): string {
  return dotted.replace(/\.(?:si|s)$/, '');
}

/** Module-level `<var> = <Callee>(...)` assignments, keyed by target. */
function callAssignments(outline: PyOutline): Array<{ target: string; call: PyCall }> {
  const out: Array<{ target: string; call: PyCall }> = [];
  for (const a of outline.assignments) {
    const target = a.targets[0];
    if (a.op !== '=' || !a.value || a.value.kind !== 'call' || !target) continue;
    out.push({ target, call: a.value });
  }
  return out;
}

function viewTarget(view: PyExpr | undefined, locals: ReadonlySet<string>): PyTarget | null {
  if (!view) return null;
  if (view.kind === 'str') return { kind: 'string', dotted: view.value };
  if (view.kind === 'name') return exprTarget(view.dotted, locals);
  if (view.kind === 'call' && view.callee.endsWith('.as_view')) {
    return exprTarget(view.callee.slice(0, -'.as_view'.length), locals);
  }
  return null;
}

function extractDjango(
  outline: PyOutline,
  imports: ImportFacts,
  routerVars: ReadonlySet<string>,
  locals: ReadonlySet<string>,
  endpoints: PyEndpointReg[],
  includes: PyIncludeReg[],
): void {
  const originalOf = (callee: string): string | undefined => imports.django.get(callee);

  const includeTarget = (call: PyCall): PyIncludeReg['target'] | null => {
    const first = positionalArgs(call)[0] ?? kwArg(call, 'arg');
    if (!first) return null;
    if (first.kind === 'str') return { kind: 'module', ref: { kind: 'string', dotted: first.value } };
    if (first.kind === 'name' && first.dotted.endsWith('.urls')) {
      const routerVar = first.dotted.slice(0, -'.urls'.length);
      return routerVars.has(routerVar) ? { kind: 'router', routerVar } : null;
    }
    if (first.kind === 'seq') {
      const s = first.items[0];
      if (s && s.kind === 'str') return { kind: 'module', ref: { kind: 'string', dotted: s.value } };
    }
    return null;
  };

  if (imports.django.size > 0) {
    for (const call of outline.calls) {
      const orig = originalOf(call.callee);
      if (!orig || !DJANGO_ROUTE_FUNCS.has(orig)) continue;
      const route = strValue(argOrKw(call, 0, 'route'));
      if (route === null) continue;
      const view = argOrKw(call, 1, 'view');
      if (view && view.kind === 'call' && originalOf(view.callee) === 'include') {
        const target = includeTarget(view);
        if (target) includes.push({ prefix: route, target, line: call.line });
        continue;
      }
      if (view && view.kind === 'name' && view.dotted.endsWith('.urls')) {
        const routerVar = view.dotted.slice(0, -'.urls'.length);
        if (routerVars.has(routerVar)) {
          includes.push({ prefix: route, target: { kind: 'router', routerVar }, line: call.line });
        }
        continue; // admin.site.urls and friends
      }
      endpoints.push({ method: null, path: route, target: viewTarget(view, locals), line: call.line });
    }
  }

  // `urlpatterns += router.urls` / `urlpatterns = router.urls` → an include with an empty prefix.
  for (const a of outline.assignments) {
    if (!a.value || a.value.kind !== 'name' || !a.value.dotted.endsWith('.urls')) continue;
    if (!a.targets.some((t) => t === 'urlpatterns')) continue;
    const routerVar = a.value.dotted.slice(0, -'.urls'.length);
    if (routerVars.has(routerVar)) {
      includes.push({ prefix: '', target: { kind: 'router', routerVar }, line: a.line });
    }
  }
}

function extractRouters(
  outline: PyOutline,
  routerVars: ReadonlySet<string>,
  locals: ReadonlySet<string>,
): PyRouterReg[] {
  const out: PyRouterReg[] = [];
  for (const call of outline.calls) {
    if (!call.callee.endsWith('.register')) continue;
    const routerVar = call.callee.slice(0, -'.register'.length);
    if (!routerVars.has(routerVar)) continue;
    const prefix = strValue(argOrKw(call, 0, 'prefix'));
    if (prefix === null) continue;
    const viewset = viewTarget(argOrKw(call, 1, 'viewset'), locals);
    if (!viewset) continue;
    out.push({ routerVar, prefix, viewset, line: call.line });
  }
  return out;
}

function routerVarsOf(outline: PyOutline): Set<string> {
  const vars = new Set<string>();
  for (const { target, call } of callAssignments(outline)) {
    if (lastSegment(call.callee).endsWith('Router')) vars.add(target);
  }
  return vars;
}

/** `<x> = Blueprint(..., url_prefix=…)` / `<x> = APIRouter(prefix=…)` → x → prefix. */
function routePrefixes(outline: PyOutline, imports: ImportFacts): Map<string, string> {
  const out = new Map<string, string>();
  for (const { target, call } of callAssignments(outline)) {
    const last = lastSegment(call.callee);
    let prefix: string | null = null;
    if (imports.flask && last === 'Blueprint') prefix = strValue(kwArg(call, 'url_prefix'));
    else if (imports.fastapi && last === 'APIRouter') prefix = strValue(kwArg(call, 'prefix'));
    if (prefix !== null) out.set(target, prefix);
  }
  return out;
}

function extractWebFrameworks(
  outline: PyOutline,
  imports: ImportFacts,
  endpoints: PyEndpointReg[],
): void {
  if (!imports.flask && !imports.fastapi) return;
  const prefixes = routePrefixes(outline, imports);
  for (const fn of outline.functions) {
    for (const dec of fn.decorators) {
      if (dec.expr.kind !== 'call') continue;
      const call = dec.expr;
      const dot = call.callee.lastIndexOf('.');
      if (dot < 0) continue;
      const owner = call.callee.slice(0, dot);
      const attr = call.callee.slice(dot + 1);
      const routePath = strValue(argOrKw(call, 0, 'rule') ?? kwArg(call, 'path'));
      if (routePath === null) continue;
      let methods: string[] | null = null;
      if (attr === 'route' && imports.flask) {
        methods = verbList(kwArg(call, 'methods'));
        if (kwArg(call, 'methods') === undefined) methods = ['GET'];
      } else if (attr === 'api_route' && imports.fastapi) {
        methods = verbList(kwArg(call, 'methods'));
        if (methods.length === 0) methods = ['GET'];
      } else if (
        (imports.flask && FLASK_VERB_DECORATORS.has(attr)) ||
        (imports.fastapi && FASTAPI_VERB_DECORATORS.has(attr))
      ) {
        methods = [attr.toUpperCase()];
      }
      if (!methods) continue;
      const prefix = prefixes.get(owner) ?? '';
      const full = prefix === '' ? routePath : `${prefix}/${routePath}`;
      for (const method of methods) {
        endpoints.push({
          method,
          path: full,
          target: { kind: 'local', name: fn.name },
          line: dec.line,
        });
      }
    }
  }
}

interface CronsAndJobs {
  crons: PyFileRegistrations['crons'];
  jobs: string[];
}

function beatEntries(dict: PyExpr): Array<{ key: string; task: string | null; schedule: PyExpr | undefined; line: number }> {
  if (dict.kind !== 'dict') return [];
  const out: Array<{ key: string; task: string | null; schedule: PyExpr | undefined; line: number }> = [];
  for (const entry of dict.entries) {
    if (!entry.key || entry.value.kind !== 'dict') continue;
    let task: string | null = null;
    let schedule: PyExpr | undefined;
    for (const inner of entry.value.entries) {
      const k = strValue(inner.key ?? undefined);
      if (k === 'task') task = strValue(inner.value);
      else if (k === 'schedule') schedule = inner.value;
    }
    out.push({ key: strValue(entry.key) ?? '', task, schedule, line: entry.value.line });
  }
  return out;
}

function isBeatTarget(a: PyAssignment): boolean {
  return a.targets.some((t) => lastSegment(t).toLowerCase().endsWith('beat_schedule'));
}

function extractCrons(outline: PyOutline, locals: ReadonlySet<string>): CronsAndJobs {
  const crons: PyFileRegistrations['crons'] = [];
  const jobs: string[] = [];

  const addBeat = (dict: PyExpr): void => {
    for (const e of beatEntries(dict)) {
      const label = e.task ? lastSegment(e.task) : e.key;
      crons.push({
        schedule: renderSchedule(e.schedule),
        label,
        target: e.task ? { kind: 'string', dotted: e.task } : null,
        line: e.line,
      });
    }
  };

  for (const a of outline.assignments) {
    if (a.value && a.op !== ':' && isBeatTarget(a)) addBeat(a.value);
    // django-crontab
    if (a.value && a.value.kind === 'seq' && a.targets.some((t) => lastSegment(t) === 'CRONJOBS')) {
      for (const item of a.value.items) {
        if (item.kind !== 'seq') continue;
        const expr = strValue(item.items[0]);
        const dotted = strValue(item.items[1]);
        if (expr === null || dotted === null) continue;
        crons.push({
          schedule: expr,
          label: lastSegment(dotted),
          target: { kind: 'string', dotted },
          line: item.line,
        });
      }
    }
  }

  for (const call of outline.calls) {
    const last = lastSegment(call.callee);
    if (call.callee.includes('.') && last === 'update') {
      const dict = kwArg(call, 'beat_schedule');
      if (dict) addBeat(dict);
    } else if (call.callee.includes('.') && last === 'add_periodic_task') {
      const schedule = argOrKw(call, 0, 'schedule');
      const sig = argOrKw(call, 1, 'sig');
      const sigName = sig?.kind === 'call' ? sig.callee : sig?.kind === 'name' ? sig.dotted : '';
      const dotted = stripCallSuffix(sigName);
      if (dotted === '') continue;
      crons.push({
        schedule: renderSchedule(schedule),
        label: lastSegment(dotted),
        target: exprTarget(dotted, locals),
        line: call.line,
      });
    } else if (call.callee.includes('.') && last === 'add_job') {
      const func = argOrKw(call, 0, 'func');
      if (!func || func.kind !== 'name') continue;
      const schedule = renderApsTrigger(strValue(argOrKw(call, 1, 'trigger')), call);
      if (schedule === null) continue;
      crons.push({
        schedule,
        label: lastSegment(func.dotted),
        target: exprTarget(func.dotted, locals),
        line: call.line,
      });
    }
  }

  for (const fn of outline.functions) {
    for (const dec of fn.decorators) {
      const d = decoratorCallee(dec);
      if (!d) continue;
      const last = lastSegment(d.callee);
      if (d.call && last === 'periodic_task') {
        const runEvery = kwArg(d.call, 'run_every');
        if (runEvery) {
          crons.push({
            schedule: renderSchedule(runEvery),
            label: fn.name,
            target: { kind: 'local', name: fn.name },
            line: dec.line,
          });
        }
      } else if (d.call && d.callee.includes('.') && last === 'scheduled_job') {
        const schedule = renderApsTrigger(strValue(positionalArgs(d.call)[0] ?? kwArg(d.call, 'trigger')), d.call);
        if (schedule !== null) {
          crons.push({
            schedule,
            label: fn.name,
            target: { kind: 'local', name: fn.name },
            line: dec.line,
          });
        }
      } else if (last === 'shared_task' || (d.callee.includes('.') && last === 'task')) {
        const label = (d.call ? strValue(kwArg(d.call, 'name')) : null) ?? fn.name;
        jobs.push(`job:${label}`);
      }
    }
  }
  return { crons, jobs };
}

export function extractPythonRegistrations(file: string, outline: PyOutline): PyFileRegistrations {
  const imports = readImports(outline);
  const locals = localNames(outline);
  const routerVars = routerVarsOf(outline);
  const endpoints: PyEndpointReg[] = [];
  const includes: PyIncludeReg[] = [];
  extractDjango(outline, imports, routerVars, locals, endpoints, includes);
  const routers = extractRouters(outline, routerVars, locals);
  extractWebFrameworks(outline, imports, endpoints);
  const { crons, jobs } = extractCrons(outline, locals);
  return { file, endpoints, routers, includes, crons, jobs: [...new Set(jobs)] };
}

// -------------------------------------------------------------- view info --

const CLASS_VERB_METHODS = new Set(VERBS.map((v) => v.toLowerCase()));

function functionMethods(fn: PyFunction): string[] | null {
  const found = new Set<string>();
  for (const dec of fn.decorators) {
    const d = decoratorCallee(dec);
    if (!d) continue;
    const last = lastSegment(d.callee);
    if (last === 'api_view') {
      const methods = d.call ? verbList(positionalArgs(d.call)[0] ?? kwArg(d.call, 'http_method_names')) : [];
      for (const m of methods.length > 0 ? methods : ['GET']) found.add(m);
    } else if (last === 'require_http_methods' && d.call) {
      for (const m of verbList(positionalArgs(d.call)[0] ?? kwArg(d.call, 'request_method_list'))) found.add(m);
    } else if (last === 'require_GET') found.add('GET');
    else if (last === 'require_POST') found.add('POST');
    else if (last === 'require_safe') {
      found.add('GET');
      found.add('HEAD');
    }
  }
  return found.size > 0 ? [...found].sort() : null;
}

function actionsOf(methods: readonly PyFunction[]): PyViewAction[] {
  const out: PyViewAction[] = [];
  for (const m of methods) {
    for (const dec of m.decorators) {
      const d = decoratorCallee(dec);
      if (!d || lastSegment(d.callee) !== 'action') continue;
      const call = d.call;
      const verbs = call ? verbList(kwArg(call, 'methods')) : [];
      out.push({
        urlPath: (call ? strValue(kwArg(call, 'url_path')) : null) ?? m.name,
        detail: call ? isTrue(kwArg(call, 'detail')) : false,
        methods: verbs.length > 0 ? verbs : ['GET'],
      });
    }
  }
  return out;
}

export function collectViewInfo(outline: PyOutline): Record<string, PyViewInfo> {
  const out: Record<string, PyViewInfo> = {};
  for (const fn of outline.functions) {
    out[fn.name] = { methods: functionMethods(fn), actions: [] };
  }
  for (const cls of outline.classes) {
    const verbs = new Set<string>();
    for (const m of cls.methods) if (CLASS_VERB_METHODS.has(m.name)) verbs.add(m.name.toUpperCase());
    out[cls.name] = {
      methods: verbs.size > 0 ? [...verbs].sort() : null,
      actions: actionsOf(cls.methods),
    };
  }
  return out;
}

// ------------------------------------------------------------ attribution --

interface RowBuilder {
  endpoints: Set<string>;
  crons: Set<string>;
}

function includeChains(
  regsByFile: ReadonlyMap<string, PyFileRegistrations>,
  targetOf: (file: string, reg: PyIncludeReg) => string | null,
): Map<string, string[][]> {
  const variants = new Map<string, string[][]>();
  const seen = new Map<string, Set<string>>();

  const record = (file: string, chain: readonly string[]): boolean => {
    const key = chain.join('\u0000');
    let keys = seen.get(file);
    if (!keys) seen.set(file, (keys = new Set()));
    if (keys.has(key) || keys.size >= MAX_VARIANTS_PER_FILE) return false;
    keys.add(key);
    const list = variants.get(file) ?? [];
    list.push([...chain]);
    variants.set(file, list);
    return true;
  };

  const walk = (file: string, chain: readonly string[], path: ReadonlySet<string>, depth: number): void => {
    if (!record(file, chain)) return;
    const reg = regsByFile.get(file);
    if (!reg || depth >= MAX_INCLUDE_DEPTH) return;
    const nextPath = new Set(path).add(file);
    for (const inc of reg.includes) {
      if (inc.target.kind !== 'module') continue;
      const to = targetOf(file, inc);
      if (!to || nextPath.has(to) || !regsByFile.has(to)) continue;
      walk(to, [...chain, inc.prefix], nextPath, depth + 1);
    }
  };

  const included = new Set<string>();
  for (const [file, reg] of regsByFile) {
    for (const inc of reg.includes) {
      const to = inc.target.kind === 'module' ? targetOf(file, inc) : null;
      if (to && to !== file) included.add(to);
    }
  }
  const files = [...regsByFile.keys()].sort();
  for (const file of files) if (!included.has(file)) walk(file, [], new Set(), 0);
  // Files only reachable through an include cycle have no root: treat them as roots.
  for (const file of files) if (!variants.has(file)) walk(file, [], new Set(), 0);
  return variants;
}

export function attributePythonFacts(
  regs: readonly PyFileRegistrations[],
  viewInfoByFile: ReadonlyMap<string, Record<string, PyViewInfo>>,
  resolver: PyFactsResolver,
): PyFactsRow[] {
  const regsByFile = new Map<string, PyFileRegistrations>();
  for (const r of regs) regsByFile.set(r.file, r);

  const resolve = (file: string, target: PyTarget | null): PyResolved | null => {
    if (!target) return null;
    if (target.kind === 'local') return { file, name: target.name };
    return resolver.resolveTarget(file, target);
  };

  const rows = new Map<string, RowBuilder>();
  const rowOf = (file: string): RowBuilder => {
    let row = rows.get(file);
    if (!row) rows.set(file, (row = { endpoints: new Set(), crons: new Set() }));
    return row;
  };
  const addEndpoint = (fact: string, registering: string, resolved: PyResolved | null): void => {
    rowOf(registering).endpoints.add(fact);
    if (resolved && resolved.file !== registering) rowOf(resolved.file).endpoints.add(fact);
  };
  const addCron = (fact: string, registering: string, resolved: PyResolved | null): void => {
    rowOf(registering).crons.add(fact);
    if (resolved && resolved.file !== registering) rowOf(resolved.file).crons.add(fact);
  };
  const viewInfoOf = (r: PyResolved | null): PyViewInfo | undefined => {
    if (!r || r.name === '') return undefined;
    const table = viewInfoByFile.get(r.file);
    return table && Object.hasOwn(table, r.name) ? table[r.name] : undefined;
  };

  const chains = includeChains(regsByFile, (file, inc) =>
    inc.target.kind === 'module' ? (resolve(file, inc.target.ref)?.file ?? null) : null,
  );

  for (const reg of regs) {
    const variants = chains.get(reg.file) ?? [[]];

    for (const ep of reg.endpoints) {
      const resolved = resolve(reg.file, ep.target);
      const inferred = viewInfoOf(resolved)?.methods;
      const methods = ep.method !== null ? [ep.method] : inferred && inferred.length > 0 ? inferred : ['ANY'];
      for (const chain of variants) {
        const path = joinRoute([...chain, ep.path]);
        for (const m of methods) addEndpoint(`${m} ${path}`, reg.file, resolved);
      }
    }

    for (const router of reg.routers) {
      const resolved = resolve(reg.file, router.viewset);
      const actions = viewInfoOf(resolved)?.actions ?? [];
      const ownPrefixes = reg.includes
        .filter((i) => i.target.kind === 'router' && i.target.routerVar === router.routerVar)
        .map((i) => i.prefix);
      for (const own of ownPrefixes.length > 0 ? ownPrefixes : ['']) {
        for (const chain of variants) {
          const base = [...chain, own, router.prefix];
          addEndpoint(`ANY ${joinRouteDir(base)}`, reg.file, resolved);
          addEndpoint(`ANY ${joinRouteDir([...base, '{pk}'])}`, reg.file, resolved);
          for (const action of actions) {
            const route = joinRouteDir(action.detail ? [...base, '{pk}', action.urlPath] : [...base, action.urlPath]);
            for (const m of action.methods) addEndpoint(`${m} ${route}`, reg.file, resolved);
          }
        }
      }
    }

    for (const cron of reg.crons) {
      addCron(`${cron.schedule} (${cron.label})`, reg.file, resolve(reg.file, cron.target));
    }
    for (const job of reg.jobs) rowOf(reg.file).crons.add(job);
  }

  const out: PyFactsRow[] = [];
  for (const [filePath, row] of rows) {
    if (row.endpoints.size === 0 && row.crons.size === 0) continue;
    out.push({ filePath, endpoints: [...row.endpoints].sort(), crons: [...row.crons].sort() });
  }
  return out.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));
}
