/**
 * Enhanced regex symbol/reference extractor for TS/JS (A3, L04).
 *
 * DESIGN NOTE (tree-sitter vs. regex): the F1 scaffolding left a TODO to wire
 * `web-tree-sitter` for accurate blast-radius. Under the parallel-phase rules
 * we MUST NOT run installs, and `web-tree-sitter` additionally needs grammar
 * `.wasm` blobs shipped+loaded at runtime — not something we can verify in this
 * phase. So we **meaningfully strengthen the regex extractor** instead (and
 * declare `web-tree-sitter` as an optional future dep in the report). The
 * extractor below is line-based but covers the declaration/reference shapes
 * that matter for finding downstream callers in a TS/JS monorepo:
 *
 *   symbols     — function / async function / generator, exported const-arrow,
 *                 class + its methods, interface, type, enum. Export-awareness.
 *   references  — call sites `sym(`, `new Sym(`, member calls `.sym(`,
 *                 JSX usage `<Sym`, and `sym` used as an identifier passed as a
 *                 value — while EXCLUDING the declaration line, import lines,
 *                 and comments. This is what lets blast-radius resolve callers.
 *
 * It is intentionally conservative about false positives (skips comment lines,
 * import/export-from lines) so the blast graph stays trustworthy.
 */

export interface ExtractedSymbol {
  name: string;
  kind: string;
  line: number;
}

export interface ExtractedReference {
  toSymbol: string;
  line: number;
}

const LINE_COMMENT = /^\s*(\/\/|\*|\/\*)/;
const IMPORT_LINE = /^\s*import\s|^\s*export\s+\{[^}]*\}\s+from\b|^\s*export\s+\*\s+from\b/;

/** Strip line/block-comment tails and string contents to reduce false matches. */
function sanitizeLine(line: string): string {
  // remove // comments
  let s = line.replace(/\/\/.*$/, '');
  // crude string blanking so `foo(` inside a string literal isn't a call
  s = s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
  return s;
}

const SYMBOL_PATTERNS: { re: RegExp; kind: string }[] = [
  // export? (default)? async? function* name(   |  function name(
  { re: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/, kind: 'function' },
  // export? abstract? class Name
  { re: /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  // export? const|let name = (  ... ) =>   |  = async (  |  = function
  {
    re: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/,
    kind: 'function',
  },
  { re: /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, kind: 'interface' },
  { re: /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, kind: 'type' },
  { re: /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/, kind: 'enum' },
];

// JS keywords / common no-symbol identifiers we never treat as a method/symbol.
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'await', 'typeof',
  'new', 'delete', 'void', 'do', 'else', 'in', 'of', 'instanceof', 'yield', 'super',
  'constructor', 'get', 'set', 'import', 'export', 'as', 'from', 'class', 'extends',
]);

// class-body method:  name(args) {  | async name(args) {  | static name(args) {
const METHOD_RE =
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\{/;

/**
 * Extract declared symbols from a single file's source.
 * Tracks a shallow `class` context so methods are reported as `<Class>.<method>`
 * AND as bare `<method>` (so reference search can find either form).
 */
export function extractSymbols(content: string): ExtractedSymbol[] {
  const out: ExtractedSymbol[] = [];
  const lines = content.split('\n');
  let classDepth = 0;
  let currentClass: string | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (LINE_COMMENT.test(raw)) {
      braceDepth += countBraces(raw);
      continue;
    }
    const line = sanitizeLine(raw);

    let matchedDecl = false;
    for (const { re, kind } of SYMBOL_PATTERNS) {
      const m = line.match(re);
      if (m?.[1] && !KEYWORDS.has(m[1])) {
        out.push({ name: m[1], kind, line: i + 1 });
        if (kind === 'class') {
          currentClass = m[1];
          classDepth = braceDepth;
        }
        matchedDecl = true;
        break;
      }
    }

    // Methods inside a class body (only when we're one level into the class).
    if (!matchedDecl && currentClass && braceDepth === classDepth + 1) {
      const mm = line.match(METHOD_RE);
      if (mm?.[1] && !KEYWORDS.has(mm[1])) {
        out.push({ name: `${currentClass}.${mm[1]}`, kind: 'method', line: i + 1 });
        out.push({ name: mm[1], kind: 'method', line: i + 1 });
      }
    }

    braceDepth += countBraces(line);
    if (currentClass && braceDepth <= classDepth) currentClass = null;
  }
  return dedupeSymbols(out);
}

function countBraces(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (ch === '{') n++;
    else if (ch === '}') n--;
  }
  return n;
}

function dedupeSymbols(syms: ExtractedSymbol[]): ExtractedSymbol[] {
  const seen = new Set<string>();
  const out: ExtractedSymbol[] = [];
  for (const s of syms) {
    const key = `${s.name}:${s.kind}:${s.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Find references (call sites / usages) of `symbol` in a file's source.
 * Matches `sym(`, `new sym(`, `.sym(`, `<Sym`, and bare-identifier usage that
 * is NOT the declaration. Skips import lines and comment lines.
 */
export function extractReferences(content: string, symbol: string): ExtractedReference[] {
  // Reference search works on the *method/function name* — if the caller passes
  // a `Class.method` symbol, match on the trailing member.
  const bare = symbol.includes('.') ? symbol.split('.').pop()! : symbol;
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const callRe = new RegExp(`(?<![\\w$.])${escaped}\\s*\\(`); // sym(
  const memberCallRe = new RegExp(`\\.${escaped}\\s*\\(`); // .sym(
  const newRe = new RegExp(`new\\s+${escaped}\\b`); // new Sym
  const jsxRe = new RegExp(`<${escaped}[\\s/>]`); // <Sym

  const declRe = new RegExp(
    `(?:function\\s*\\*?\\s*|class\\s+|interface\\s+|type\\s+|enum\\s+|(?:const|let|var)\\s+)${escaped}\\b`,
  );

  const out: ExtractedReference[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (LINE_COMMENT.test(raw) || IMPORT_LINE.test(raw)) continue;
    const line = sanitizeLine(raw);
    if (declRe.test(line)) continue; // the declaration itself is not a reference
    if (callRe.test(line) || memberCallRe.test(line) || newRe.test(line) || jsxRe.test(line)) {
      out.push({ toSymbol: symbol, line: i + 1 });
    }
  }
  return out;
}

/** One detected registration: the fact string plus the trailing plain-identifier handler, if any. */
export interface ExtractedFact {
  fact: string;
  handler: string | null;
}

// Never a handler: JS keywords and literals that can end an argument list.
const NON_HANDLERS = new Set(['true', 'false', 'null', 'undefined', 'this']);
const TRAILING_HANDLER_RE = /,\s*([A-Za-z_$][\w$]*)\s*\)\s*;?\s*$/;
const HANDLER_PROP_RE = /\bhandler\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/;

function acceptHandler(name: string | undefined): string | null {
  if (!name || KEYWORDS.has(name) || NON_HANDLERS.has(name)) return null;
  return name;
}

/** Text of `raw` after `end`, with a trailing `// comment` stripped. */
function tailAfter(raw: string, end: number): string {
  return raw.slice(end).replace(/\s\/\/.*$/, '');
}

/** Handler = last argument of a call that closes on this line, when it is a plain identifier. */
function trailingHandler(tail: string): string | null {
  return acceptHandler(tail.match(TRAILING_HANDLER_RE)?.[1]);
}

/**
 * Heuristic endpoint detector: HTTP route registrations in a file, one item per
 * match in source order. Catches Fastify/Express style `app.get('/path', ...)`,
 * `router.post(...)`, `app.get<...>('/path')`, and `route({ method, url })`.
 * The fact is "METHOD /path"; the handler is captured only when it is a plain
 * identifier closing the call on the same line (or `handler: name` in a route
 * object) — inline arrows, member expressions and multi-line calls are `null`.
 */
export function extractEndpointFacts(content: string): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  const verbRe =
    /\b(?:app|router|fastify|server|api)\.(get|post|put|patch|delete|options|head)\s*(?:<[^>]*>)?\s*\(\s*(['"`])([^'"`]+)\2/i;
  const routeObjRe = /method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`][\s\S]*?url\s*:\s*['"`]([^'"`]+)['"`]/i;
  for (const raw of content.split('\n')) {
    const m = raw.match(verbRe);
    if (m) {
      out.push({
        fact: `${m[1]!.toUpperCase()} ${m[3]}`,
        handler: trailingHandler(tailAfter(raw, m.index! + m[0].length)),
      });
    }
    const r = raw.match(routeObjRe);
    if (r) {
      out.push({
        fact: `${r[1]!.toUpperCase()} ${r[2]}`,
        handler: acceptHandler(tailAfter(raw, 0).match(HANDLER_PROP_RE)?.[1]),
      });
    }
  }
  return out;
}

/**
 * Heuristic cron/scheduled-job detector, one item per match in source order.
 * Catches cron expressions in `schedule('* * * * *')`, `cron.schedule(...)`,
 * `CronJob(...)`, and `jobs.register('kind')` / `enqueue(ws, 'kind')` style
 * background work. Handler capture follows the same rule as endpoints.
 */
export function extractCronFacts(content: string): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  const cronExprRe = /\b(?:cron|schedule|CronJob)\s*[.(]?\s*\(?\s*['"`]([^'"`]*(?:\*|\d+\s+\d+)[^'"`]*)['"`]/i;
  const jobKindRe = /\b(?:register|enqueue)\s*\(\s*(?:[A-Za-z0-9_$.]+\s*,\s*)?['"`]([a-z][a-z0-9_]*)['"`]/i;
  for (const raw of content.split('\n')) {
    const m = raw.match(cronExprRe);
    if (m) {
      out.push({
        fact: m[1]!.trim(),
        handler: trailingHandler(tailAfter(raw, m.index! + m[0].length)),
      });
    }
    const j = raw.match(jobKindRe);
    if (j && /poll|index|clone|digest|cron|sync|schedule|job/i.test(raw)) {
      out.push({
        fact: `job:${j[1]}`,
        handler: trailingHandler(tailAfter(raw, j.index! + j[0].length)),
      });
    }
  }
  return out;
}

/**
 * Folds items into sorted unique facts + a handler map. A fact with ANY
 * null-handler item gets no key (absent key = handler unknown).
 */
export function foldFactHandlers(items: readonly ExtractedFact[]): {
  facts: string[];
  handlers: Record<string, string[]>;
} {
  const byFact = new Map<string, { names: Set<string>; unknown: boolean }>();
  for (const { fact, handler } of items) {
    let e = byFact.get(fact);
    if (!e) byFact.set(fact, (e = { names: new Set(), unknown: false }));
    if (handler === null) e.unknown = true;
    else e.names.add(handler);
  }
  const facts = [...byFact.keys()].sort();
  const handlers: Record<string, string[]> = {};
  for (const fact of facts) {
    const e = byFact.get(fact)!;
    if (!e.unknown && e.names.size > 0) handlers[fact] = [...e.names].sort();
  }
  return { facts, handlers };
}

/** Distinct "METHOD /path" endpoints in first-seen order (see `extractEndpointFacts`). */
export function extractEndpoints(content: string): string[] {
  return [...new Set(extractEndpointFacts(content).map((i) => i.fact))];
}

/** Distinct cron expressions / job kinds in first-seen order (see `extractCronFacts`). */
export function extractCrons(content: string): string[] {
  return [...new Set(extractCronFacts(content).map((i) => i.fact))];
}
