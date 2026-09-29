/**
 * Dependency-free Python scanner (docs/plans/repo-intel-python.md, Decision 1).
 *
 * Line/indent-aware tokenizer + statement layer + tolerant expression parser that
 * produces one `PyOutline`. It never throws: garbage in, partial outline out.
 * Imports only `./types.js` (pure, in-process, no I/O).
 */
import type {
  PyArg,
  PyAssignment,
  PyCall,
  PyClass,
  PyDecorator,
  PyDictEntry,
  PyExpr,
  PyFunction,
  PyImport,
  PyImportName,
  PyNameUse,
  PyOutline,
} from './types.js';

// -------------------------------------------------------------- tokenizer --

interface Tok {
  k: 'name' | 'num' | 'str' | 'op';
  /** name/num/op: source text; str: inner text (prefix and quotes dropped). */
  v: string;
  line: number;
  endLine: number;
  /** Source offsets, [s, e). */
  s: number;
  e: number;
}

interface LogicalLine {
  indent: number;
  toks: Tok[];
  endLine: number;
}

const OPS3 = new Set(['**=', '//=', '>>=', '<<=']);
const OPS2 = new Set([
  '**', '//', '<<', '>>', '<=', '>=', '==', '!=', '<>', '->', ':=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=',
]);
const NUM_RE = /(?:0[xXoObB][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[jJlL]?/y;
const STR_PREFIX_RE = /^[rRbBuUfF]{1,2}$/;

function isIdStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c > 127;
}
function isIdPart(c: number): boolean {
  return isIdStart(c) || (c >= 48 && c <= 57);
}
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function unescapeStr(raw: string): string {
  return raw.indexOf('\\') === -1 ? raw : raw.replace(/\\([\\'"])/g, '$1');
}

function tokenize(src: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let depth = 0;
  let cur: Tok[] = [];
  let curIndent = 0;
  let atStart = true;

  const finish = (): void => {
    const last = cur[cur.length - 1];
    if (last) lines.push({ indent: curIndent, toks: cur, endLine: last.endLine });
    cur = [];
  };

  while (i < n) {
    if (atStart) {
      let col = 0;
      let j = i;
      while (j < n) {
        const ch = src.charCodeAt(j);
        if (ch === 32) col++;
        else if (ch === 9) col = (Math.floor(col / 8) + 1) * 8;
        else if (ch === 12) col = 0;
        else break;
        j++;
      }
      if (j >= n) break;
      const ch = src.charCodeAt(j);
      if (ch === 10) {
        i = j + 1;
        line++;
        continue;
      }
      if (ch === 35) {
        const k = src.indexOf('\n', j);
        if (k === -1) break;
        i = k + 1;
        line++;
        continue;
      }
      i = j;
      curIndent = col;
      atStart = false;
    }

    const c = src.charCodeAt(i);
    if (c === 10) {
      line++;
      i++;
      if (depth === 0) {
        finish();
        atStart = true;
      }
      continue;
    }
    if (c === 32 || c === 9 || c === 12 || c === 11 || c === 13) {
      i++;
      continue;
    }
    if (c === 35) {
      const k = src.indexOf('\n', i);
      i = k === -1 ? n : k;
      continue;
    }
    if (c === 92) {
      if (src.charCodeAt(i + 1) === 10) {
        i += 2;
        line++;
      } else {
        i++;
      }
      continue;
    }

    let strQuote = -1;
    let identEnd = -1;
    if (c === 34 || c === 39) {
      strQuote = i;
    } else if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src.charCodeAt(j))) j++;
      const next = src.charCodeAt(j);
      if (j - i <= 2 && (next === 34 || next === 39) && STR_PREFIX_RE.test(src.slice(i, j))) strQuote = j;
      else identEnd = j;
    }

    if (identEnd !== -1) {
      cur.push({ k: 'name', v: src.slice(i, identEnd), line, endLine: line, s: i, e: identEnd });
      i = identEnd;
      continue;
    }

    if (strQuote !== -1) {
      const q = src[strQuote] as string;
      const triple = src.startsWith(q + q + q, strQuote);
      const startLine = line;
      let p = strQuote + (triple ? 3 : 1);
      const innerStart = p;
      let end: number;
      if (triple) {
        const close = q + q + q;
        while (p < n) {
          const ch = src[p];
          if (ch === '\\') {
            if (src[p + 1] === '\n') line++;
            p += 2;
            continue;
          }
          if (ch === '\n') {
            line++;
            p++;
            continue;
          }
          if (src.startsWith(close, p)) break;
          p++;
        }
        end = p < n ? p + 3 : n;
      } else {
        while (p < n) {
          const ch = src[p];
          if (ch === '\\') {
            if (src[p + 1] === '\n') line++;
            p += 2;
            continue;
          }
          if (ch === '\n' || ch === q) break;
          p++;
        }
        end = p < n && src[p] === q ? p + 1 : Math.min(p, n);
      }
      const innerEnd = Math.min(p, n);
      cur.push({ k: 'str', v: unescapeStr(src.slice(innerStart, innerEnd)), line: startLine, endLine: line, s: i, e: end });
      i = end;
      continue;
    }

    if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
      NUM_RE.lastIndex = i;
      const m = NUM_RE.exec(src);
      if (m && m[0].length > 0) {
        cur.push({ k: 'num', v: m[0], line, endLine: line, s: i, e: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    let op = src[i] as string;
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (OPS3.has(three)) op = three;
    else if (OPS2.has(two)) op = two;
    if (op === '(' || op === '[' || op === '{') depth++;
    else if (op === ')' || op === ']' || op === '}') depth = Math.max(0, depth - 1);
    cur.push({ k: 'op', v: op, line, endLine: line, s: i, e: i + op.length });
    i += op.length;
  }
  finish();
  return lines;
}

// ----------------------------------------------------------------- parser --

/** Keywords that can never start an expression atom. */
const NON_ATOM = new Set([
  'if', 'elif', 'else', 'for', 'while', 'in', 'is', 'and', 'or', 'as', 'from', 'import', 'def', 'class',
  'return', 'pass', 'break', 'continue', 'raise', 'try', 'except', 'finally', 'with', 'del', 'assert',
  'global', 'nonlocal', 'async',
]);
const LITERAL_NAMES = new Set(['None', 'True', 'False']);
const BIN_OPS = new Set([
  '+', '-', '*', '/', '//', '%', '**', '@', '|', '&', '^', '<<', '>>', '<', '>', '<=', '>=', '==', '!=', '<>', ':=',
]);
const PREFIX_OPS = new Set(['-', '+', '~', '*', '**']);
const START_OPS = new Set(['(', '[', '{', '-', '+', '~', '*', '**', '.']);
const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);
const MAX_DEPTH = 100;
const TEXT_CAP = 200;

interface Shared {
  src: string;
  out: PyOutline;
  useOf: WeakMap<object, PyNameUse>;
}

function isOpTok(t: Tok | undefined, v: string): boolean {
  return t !== undefined && t.k === 'op' && t.v === v;
}
function isNameTok(t: Tok | undefined, v?: string): boolean {
  return t !== undefined && t.k === 'name' && (v === undefined || t.v === v);
}

/** Source text of tokens [from, to) with whitespace collapsed and comments dropped. */
function joinToks(src: string, toks: Tok[], from: number, to: number, cap = Infinity): string {
  let text = '';
  for (let i = from; i < to; i++) {
    const t = toks[i];
    if (!t) break;
    const prev = toks[i - 1];
    if (i > from && prev && prev.e < t.s) text += ' ';
    text += src.slice(t.s, t.e).replace(/\s*\n\s*/g, ' ');
    if (text.length > cap) return text.slice(0, cap);
  }
  return text;
}

class Parser {
  pos = 0;
  private depth = 0;
  private suppress = 0;
  private noIn = 0;

  constructor(
    private readonly sh: Shared,
    private readonly toks: Tok[],
  ) {}

  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }
  peek(o = 0): Tok | undefined {
    return this.toks[this.pos + o];
  }
  isOp(v: string, o = 0): boolean {
    return isOpTok(this.peek(o), v);
  }
  isName(v: string, o = 0): boolean {
    return isNameTok(this.peek(o), v);
  }

  private other(start: number, line: number): PyExpr {
    return { kind: 'other', text: joinToks(this.sh.src, this.toks, start, this.pos, TEXT_CAP), line };
  }
  private empty(): PyExpr {
    return { kind: 'other', text: '', line: this.peek()?.line ?? this.toks[this.toks.length - 1]?.line ?? 0 };
  }

  private startsExpr(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.k === 'name') return !NON_ATOM.has(t.v);
    if (t.k === 'op') return START_OPS.has(t.v);
    return true;
  }

  private isCompStart(): boolean {
    return this.isName('for') || (this.isName('async') && this.isName('for', 1));
  }

  /** Consume the rest of the tokens, still recording names and calls where possible. */
  drain(): void {
    while (!this.atEnd()) {
      const p0 = this.pos;
      if (this.startsExpr()) this.parseItems();
      if (this.pos === p0) this.pos++;
    }
  }

  /** `test (',' test)*` with a tolerated trailing comma. */
  parseItems(): { items: PyExpr[]; comma: boolean; line: number } {
    const line = this.peek()?.line ?? 0;
    const items: PyExpr[] = [];
    let comma = false;
    for (;;) {
      if (!this.startsExpr()) break;
      const p0 = this.pos;
      const e = this.parseTest();
      if (this.pos === p0) break;
      items.push(e);
      if (this.isOp(',')) {
        comma = true;
        this.pos++;
        continue;
      }
      break;
    }
    return { items, comma, line };
  }

  parseExprList(): PyExpr {
    const { items, comma, line } = this.parseItems();
    const only = items[0];
    if (items.length === 1 && !comma && only) return only;
    if (items.length === 0) return { kind: 'other', text: '', line };
    return { kind: 'seq', items, line };
  }

  parseTargetList(): void {
    this.suppress++;
    this.noIn++;
    this.parseItems();
    this.suppress--;
    this.noIn--;
  }

  parseTest(): PyExpr {
    return this.parseBinary();
  }

  private parseBinary(): PyExpr {
    const start = this.pos;
    const first = this.peek();
    if (!first) return this.empty();
    const left = this.parseUnary();
    let isOther = false;
    loop: for (;;) {
      const t = this.peek();
      if (!t) break;
      if (t.k === 'op') {
        if (!BIN_OPS.has(t.v)) break;
        this.pos++;
      } else if (t.k === 'name') {
        switch (t.v) {
          case 'and':
          case 'or':
          case 'if':
          case 'else':
          case 'from':
            this.pos++;
            break;
          case 'in':
            if (this.noIn > 0) break loop;
            this.pos++;
            break;
          case 'is':
            this.pos++;
            if (this.isName('not')) this.pos++;
            break;
          case 'not':
            if (!this.isName('in', 1)) break loop;
            this.pos += 2;
            break;
          case 'as': {
            this.pos++;
            if (this.startsExpr()) {
              this.suppress++;
              this.parseUnary();
              this.suppress--;
            }
            isOther = true;
            continue loop;
          }
          default:
            break loop;
        }
      } else {
        break;
      }
      isOther = true;
      if (this.startsExpr()) {
        const p0 = this.pos;
        this.parseUnary();
        if (this.pos === p0) break;
      }
    }
    return isOther ? this.other(start, first.line) : left;
  }

  private parseUnary(): PyExpr {
    const t = this.peek();
    if (!t) return this.empty();
    const start = this.pos;
    if (t.k === 'op' && PREFIX_OPS.has(t.v)) return this.parsePrefix(start, t.line, false);
    if (t.k === 'name') {
      if (t.v === 'not' || t.v === 'await') return this.parsePrefix(start, t.line, false);
      if (t.v === 'yield') return this.parsePrefix(start, t.line, true);
      if (t.v === 'lambda') return this.parseLambda(start, t.line);
    }
    return this.parsePrimary();
  }

  /** Prefix operator / `not` / `await` (recurse into the operand) or `yield [from] items`. */
  private parsePrefix(start: number, line: number, isYield: boolean): PyExpr {
    this.pos++;
    if (this.depth >= MAX_DEPTH) {
      this.pos = this.toks.length;
      return this.other(start, line);
    }
    this.depth++;
    try {
      if (isYield) {
        if (this.isName('from')) this.pos++;
        if (this.startsExpr()) this.parseItems();
      } else if (this.startsExpr()) {
        this.parseUnary();
      }
    } finally {
      this.depth--;
    }
    return this.other(start, line);
  }

  private parseLambda(start: number, line: number): PyExpr {
    this.pos++;
    while (!this.atEnd() && !this.isOp(':')) {
      if (this.isOp('=')) {
        this.pos++;
        const p0 = this.pos;
        this.parseTest();
        if (this.pos === p0) this.pos++;
      } else {
        this.pos++;
      }
    }
    if (this.isOp(':')) this.pos++;
    if (this.depth >= MAX_DEPTH) {
      this.pos = this.toks.length;
    } else {
      this.depth++;
      try {
        this.parseTest();
      } finally {
        this.depth--;
      }
    }
    return this.other(start, line);
  }

  private skipBalanced(): void {
    let d = 0;
    while (!this.atEnd()) {
      const t = this.peek() as Tok;
      this.pos++;
      if (t.k !== 'op') continue;
      if (OPEN.has(t.v)) d++;
      else if (CLOSE.has(t.v) && --d <= 0) return;
    }
  }

  private parseCompClauses(): void {
    for (;;) {
      const p0 = this.pos;
      if (this.isCompStart()) {
        if (this.isName('async')) this.pos++;
        this.pos++;
        this.parseTargetList();
        if (this.isName('in')) this.pos++;
        this.parseTest();
      } else if (this.isName('if')) {
        this.pos++;
        this.parseTest();
      } else {
        break;
      }
      if (this.pos === p0) break;
    }
  }

  parseArgs(): PyArg[] {
    const args: PyArg[] = [];
    while (!this.atEnd() && !this.isOp(')')) {
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      const p0 = this.pos;
      const t = this.peek() as Tok;
      let star: '' | '*' | '**' = '';
      let keyword: string | null = null;
      if (t.k === 'op' && (t.v === '*' || t.v === '**')) {
        star = t.v;
        this.pos++;
      } else if (t.k === 'name' && !NON_ATOM.has(t.v) && this.isOp('=', 1)) {
        keyword = t.v;
        this.pos += 2;
      }
      const afterPrefix = this.pos;
      let value = this.parseTest();
      if (this.isCompStart()) {
        this.parseCompClauses();
        value = { kind: 'other', text: '', line: t.line };
      }
      if (this.pos === afterPrefix) {
        if (this.pos === p0) this.pos++;
        continue;
      }
      args.push({ keyword, star, value });
    }
    return args;
  }

  private parsePrimary(): PyExpr {
    const t = this.peek();
    if (!t) return this.empty();
    const start = this.pos;
    let expr: PyExpr;
    let chain = '';

    if (t.k === 'name') {
      if (NON_ATOM.has(t.v)) return this.empty();
      let dotted = t.v;
      this.pos++;
      for (;;) {
        const nx = this.peek(1);
        if (this.isOp('.') && nx && nx.k === 'name') {
          dotted += '.' + nx.v;
          this.pos += 2;
        } else break;
      }
      const isCall = this.isOp('(');
      expr = { kind: 'name', dotted, line: t.line };
      if (!LITERAL_NAMES.has(dotted) && this.suppress === 0) {
        const use: PyNameUse = { dotted, line: t.line, isCall };
        this.sh.out.nameUses.push(use);
        this.sh.useOf.set(expr, use);
      }
      chain = dotted;
    } else if (t.k === 'str') {
      let value = '';
      while (this.peek()?.k === 'str') {
        value += (this.peek() as Tok).v;
        this.pos++;
      }
      expr = { kind: 'str', value, line: t.line };
    } else if (t.k === 'num') {
      this.pos++;
      expr = { kind: 'num', value: t.v, line: t.line };
    } else if (t.k === 'op' && OPEN.has(t.v)) {
      if (this.depth >= MAX_DEPTH) {
        this.skipBalanced();
        expr = this.other(start, t.line);
      } else {
        this.depth++;
        try {
          expr = this.parseBracket(t);
        } finally {
          this.depth--;
        }
      }
    } else if (t.k === 'op' && t.v === '.') {
      while (this.isOp('.')) this.pos++;
      expr = this.other(start, t.line);
    } else {
      return this.empty();
    }

    // trailers: calls, subscripts, attribute access on non-plain values
    for (;;) {
      if (this.isOp('(')) {
        const open = this.peek() as Tok;
        this.pos++;
        const call: PyCall = { kind: 'call', callee: expr.kind === 'name' ? chain : '', args: [], line: t.line, endLine: open.endLine };
        this.sh.out.calls.push(call);
        if (this.depth >= MAX_DEPTH) {
          this.pos--;
          this.skipBalanced();
        } else {
          this.depth++;
          try {
            call.args = this.parseArgs();
          } finally {
            this.depth--;
          }
          if (this.isOp(')')) {
            call.endLine = (this.peek() as Tok).endLine;
            this.pos++;
          } else {
            call.endLine = this.toks[this.toks.length - 1]?.endLine ?? open.endLine;
          }
        }
        expr = call;
      } else if (this.isOp('[')) {
        this.pos++;
        if (this.depth >= MAX_DEPTH) {
          this.pos--;
          this.skipBalanced();
        } else {
          this.depth++;
          try {
            this.parseSubscript();
          } finally {
            this.depth--;
          }
        }
        expr = this.other(start, t.line);
      } else if (this.isOp('.') && this.peek(1)?.k === 'name') {
        this.pos += 2;
        expr = this.other(start, t.line);
      } else {
        break;
      }
      chain = '';
    }
    if (expr.kind === 'name' && expr.dotted !== chain) return this.other(start, t.line);
    return expr;
  }

  private parseSubscript(): void {
    while (!this.atEnd() && !this.isOp(']')) {
      if (this.isOp(':') || this.isOp(',')) {
        this.pos++;
        continue;
      }
      const p0 = this.pos;
      if (this.startsExpr()) this.parseTest();
      if (this.pos === p0) this.pos++;
    }
    if (this.isOp(']')) this.pos++;
  }

  private parseBracket(open: Tok): PyExpr {
    const start = this.pos;
    this.pos++;
    if (open.v === '(') {
      if (this.isOp(')')) {
        this.pos++;
        return { kind: 'seq', items: [], line: open.line };
      }
      const { items, comma } = this.parseItems();
      let result: PyExpr;
      if (this.isCompStart()) {
        this.parseCompClauses();
        this.closeIf(')');
        return this.other(start, open.line);
      }
      const only = items[0];
      if (items.length === 1 && !comma && only) result = only;
      else result = { kind: 'seq', items, line: open.line };
      this.closeIf(')');
      return result;
    }
    if (open.v === '[') {
      const { items } = this.parseItems();
      if (this.isCompStart()) {
        this.parseCompClauses();
        this.closeIf(']');
        return this.other(start, open.line);
      }
      this.closeIf(']');
      return { kind: 'seq', items, line: open.line };
    }
    // '{': dict or set
    const entries: PyDictEntry[] = [];
    const setItems: PyExpr[] = [];
    let isDict = false;
    let comp = false;
    while (!this.atEnd() && !this.isOp('}')) {
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      const p0 = this.pos;
      let entry: PyDictEntry | null = null;
      let item: PyExpr | null = null;
      if (this.isOp('**')) {
        this.pos++;
        entry = { key: null, value: this.parseBinary() };
      } else {
        const k = this.parseTest();
        if (this.pos > p0 && this.isOp(':')) {
          this.pos++;
          entry = { key: k, value: this.parseTest() };
        } else if (this.pos > p0) {
          item = k;
        }
      }
      if (this.isCompStart()) {
        this.parseCompClauses();
        comp = true;
      }
      if (this.pos === p0) {
        this.pos++;
        continue;
      }
      if (entry) {
        entries.push(entry);
        isDict = true;
      } else if (item) {
        setItems.push(item);
      }
    }
    this.closeIf('}');
    if (comp) return this.other(start, open.line);
    if (isDict || setItems.length === 0) return { kind: 'dict', entries, line: open.line };
    return { kind: 'seq', items: setItems, line: open.line };
  }

  private closeIf(v: string): void {
    if (this.isOp(v)) this.pos++;
  }

  /** Remove the nameUse recorded for a plain-name assignment target (`x`, `a.b`, or names in a tuple). */
  dropTargetUses(e: PyExpr, targets: string[] | null): void {
    if (e.kind === 'name') {
      const use = this.sh.useOf.get(e);
      if (use) {
        const uses = this.sh.out.nameUses;
        const idx = uses.lastIndexOf(use);
        if (idx !== -1) uses.splice(idx, 1);
      }
      if (targets && !LITERAL_NAMES.has(e.dotted)) targets.push(e.dotted);
    } else if (e.kind === 'seq') {
      for (const it of e.items) this.dropTargetUses(it, null);
    }
  }
}

// -------------------------------------------------------------- statements --

type Scope = { kind: 'module' } | { kind: 'class'; cls: PyClass } | { kind: 'nested' };

interface Block {
  indent: number;
  scope: Scope;
  node: { endLine: number } | null;
}

const COMPOUND = new Set(['if', 'elif', 'else', 'while', 'for', 'try', 'except', 'finally', 'with']);
const SOFT_NOT_HEAD = new Set(['=', '.', ',', ':', ')', ']', '}', '+=', '-=', '*=', '/=', '(', '[']);

/** First ':' at bracket depth 0 that is not a lambda's colon, or -1. */
function findHeaderColon(toks: Tok[], from: number): number {
  let depth = 0;
  let lam = 0;
  for (let i = from; i < toks.length; i++) {
    const t = toks[i] as Tok;
    if (t.k === 'op') {
      if (OPEN.has(t.v)) depth++;
      else if (CLOSE.has(t.v)) depth = Math.max(0, depth - 1);
      else if (t.v === ':' && depth === 0) {
        if (lam > 0) lam--;
        else return i;
      }
    } else if (t.k === 'name' && t.v === 'lambda' && depth === 0) {
      lam++;
    }
  }
  return -1;
}

/** Index of the bracket matching the opener at `openIdx`, or toks.length when unbalanced. */
function matchingClose(toks: Tok[], openIdx: number): number {
  let d = 0;
  for (let i = openIdx; i < toks.length; i++) {
    const t = toks[i] as Tok;
    if (t.k !== 'op') continue;
    if (OPEN.has(t.v)) d++;
    else if (CLOSE.has(t.v) && --d === 0) return i;
  }
  return toks.length;
}

function splitSemicolons(toks: Tok[]): Tok[][] {
  const parts: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.k === 'op') {
      if (OPEN.has(t.v)) depth++;
      else if (CLOSE.has(t.v)) depth = Math.max(0, depth - 1);
      else if (t.v === ';' && depth === 0) {
        if (cur.length) parts.push(cur);
        cur = [];
        continue;
      }
    }
    cur.push(t);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

class Builder {
  private readonly sh: Shared;
  private readonly stack: Block[] = [{ indent: -1, scope: { kind: 'module' }, node: null }];
  private pending: PyDecorator[] = [];
  private lastEnd = 0;

  constructor(
    src: string,
    private readonly out: PyOutline,
  ) {
    this.sh = { src, out, useOf: new WeakMap() };
  }

  run(lines: LogicalLine[]): void {
    for (const ll of lines) {
      while (this.stack.length > 1 && (this.stack[this.stack.length - 1] as Block).indent >= ll.indent) this.closeTop();
      try {
        this.handle(ll);
      } catch {
        // a single broken statement must not lose the rest of the file
      }
      this.lastEnd = ll.endLine;
    }
    while (this.stack.length > 1) this.closeTop();
  }

  private closeTop(): void {
    const b = this.stack.pop();
    if (b?.node) b.node.endLine = Math.max(b.node.endLine, this.lastEnd);
  }

  private get scope(): Scope {
    return (this.stack[this.stack.length - 1] as Block).scope;
  }

  private parser(toks: Tok[]): Parser {
    return new Parser(this.sh, toks);
  }

  private handle(ll: LogicalLine): void {
    const toks = ll.toks;
    const t0 = toks[0];
    if (!t0) return;

    if (isOpTok(t0, '@')) {
      const p = this.parser(toks.slice(1));
      const expr = p.parseTest();
      p.drain();
      this.pending.push({ line: t0.line, expr });
      return;
    }

    if (t0.k === 'name') {
      const t1 = toks[1];
      if (t0.v === 'def' || (t0.v === 'async' && isNameTok(t1, 'def'))) {
        this.handleDef(ll, t0.v === 'async');
        return;
      }
      if (t0.v === 'class') {
        this.handleClass(ll);
        return;
      }
      if (COMPOUND.has(t0.v) || (t0.v === 'async' && (isNameTok(t1, 'for') || isNameTok(t1, 'with')))) {
        this.pending = [];
        this.handleCompound(ll, t0.v === 'async' ? 2 : 1);
        return;
      }
      if ((t0.v === 'match' || t0.v === 'case') && t1 && !(t1.k === 'op' && SOFT_NOT_HEAD.has(t1.v))) {
        const c = findHeaderColon(toks, 1);
        if (c > 1) {
          this.pending = [];
          this.handleCompound(ll, 1);
          return;
        }
      }
    }
    this.pending = [];
    this.simpleList(toks, this.scope);
  }

  private handleCompound(ll: LogicalLine, kwLen: number): void {
    const toks = ll.toks;
    const kw = (toks[kwLen - 1] as Tok).v;
    const c = findHeaderColon(toks, kwLen);
    const headerEnd = c === -1 ? toks.length : c;
    const p = this.parser(toks.slice(kwLen, headerEnd));
    if (kw === 'for') {
      p.parseTargetList();
      if (p.isName('in')) p.pos++;
      p.parseExprList();
    } else {
      if (kw === 'except' && p.isOp('*')) p.pos++;
      p.parseExprList();
    }
    p.drain();
    if (c !== -1 && c + 1 < toks.length) this.simpleList(toks.slice(c + 1), this.scope);
    else this.stack.push({ indent: ll.indent, scope: this.scope, node: null });
  }

  private handleDef(ll: LogicalLine, isAsync: boolean): void {
    const toks = ll.toks;
    const k = isAsync ? 2 : 1;
    const nameTok = toks[k];
    const decorators = this.pending;
    this.pending = [];
    if (!nameTok || nameTok.k !== 'name' || !isOpTok(toks[k + 1], '(')) {
      this.parser(toks).drain();
      return;
    }
    const scope = this.scope;
    const c = findHeaderColon(toks, k + 1);
    const headerEnd = c === -1 ? toks.length : c;
    const first = toks[0] as Tok;
    const fn: PyFunction = {
      name: nameTok.v,
      line: first.line,
      endLine: ll.endLine,
      async: isAsync,
      decorators,
      signature: joinToks(this.sh.src, toks, 0, headerEnd),
    };
    if (scope.kind === 'module') this.out.functions.push(fn);
    else if (scope.kind === 'class') scope.cls.methods.push(fn);

    const closeIdx = matchingClose(toks, k + 1);
    this.parseParams(toks.slice(k + 2, closeIdx));
    if (isOpTok(toks[closeIdx + 1], '->')) {
      const p = this.parser(toks.slice(closeIdx + 2, headerEnd));
      p.parseTest();
      p.drain();
    }

    if (c !== -1 && c + 1 < toks.length) this.simpleList(toks.slice(c + 1), { kind: 'nested' });
    else this.stack.push({ indent: ll.indent, scope: { kind: 'nested' }, node: fn });
  }

  private parseParams(ptoks: Tok[]): void {
    const p = this.parser(ptoks);
    while (!p.atEnd()) {
      const p0 = p.pos;
      if (p.isOp(',') || p.isOp('/')) p.pos++;
      else if (p.isOp('*') || p.isOp('**')) p.pos++;
      else if (p.peek()?.k === 'name') {
        p.pos++;
        if (p.isOp(':')) {
          p.pos++;
          p.parseTest();
        }
        if (p.isOp('=')) {
          p.pos++;
          p.parseTest();
        }
      }
      if (p.pos === p0) p.pos++;
    }
  }

  private handleClass(ll: LogicalLine): void {
    const toks = ll.toks;
    const nameTok = toks[1];
    const decorators = this.pending;
    this.pending = [];
    if (!nameTok || nameTok.k !== 'name') {
      this.parser(toks).drain();
      return;
    }
    const parentScope = this.scope;
    const c = findHeaderColon(toks, 2);
    const headerEnd = c === -1 ? toks.length : c;
    let bases: PyArg[] = [];
    if (isOpTok(toks[2], '(')) {
      const closeIdx = Math.min(matchingClose(toks, 2), headerEnd);
      const p = this.parser(toks.slice(3, closeIdx));
      bases = p.parseArgs();
      p.drain();
    }
    const cls: PyClass = {
      name: nameTok.v,
      line: (toks[0] as Tok).line,
      endLine: ll.endLine,
      bases,
      decorators,
      signature: joinToks(this.sh.src, toks, 0, headerEnd),
      methods: [],
      assignments: [],
    };
    let bodyScope: Scope = { kind: 'nested' };
    if (parentScope.kind === 'module') {
      this.out.classes.push(cls);
      bodyScope = { kind: 'class', cls };
    }
    if (c !== -1 && c + 1 < toks.length) this.simpleList(toks.slice(c + 1), bodyScope);
    else this.stack.push({ indent: ll.indent, scope: bodyScope, node: cls });
  }

  private simpleList(toks: Tok[], scope: Scope): void {
    for (const part of splitSemicolons(toks)) {
      try {
        this.simple(part, scope);
      } catch {
        // tolerate
      }
    }
  }

  private simple(part: Tok[], scope: Scope): void {
    const t0 = part[0];
    if (!t0) return;
    if (t0.k === 'name') {
      switch (t0.v) {
        case 'import':
          this.parseImport(part);
          return;
        case 'from':
          this.parseFrom(part);
          return;
        case 'global':
        case 'nonlocal':
        case 'pass':
        case 'break':
        case 'continue':
          return;
        case 'return':
        case 'raise':
        case 'del':
        case 'assert': {
          const p = this.parser(part.slice(1));
          p.parseExprList();
          p.drain();
          return;
        }
        default:
          break;
      }
    }
    this.expressionStatement(part, scope);
  }

  private expressionStatement(part: Tok[], scope: Scope): void {
    const p = this.parser(part);
    const first = p.parseExprList();
    const line = (part[0] as Tok).line;

    const record = (a: PyAssignment): void => {
      if (a.targets.length === 0) return;
      if (scope.kind === 'module') this.out.assignments.push(a);
      else if (scope.kind === 'class') scope.cls.assignments.push(a);
    };

    if (p.isOp('=')) {
      const exprs: PyExpr[] = [first];
      while (p.isOp('=')) {
        p.pos++;
        exprs.push(p.parseExprList());
      }
      const value = exprs.pop() as PyExpr;
      const targets: string[] = [];
      for (const e of exprs) p.dropTargetUses(e, targets);
      record({ line, targets, op: '=', value });
    } else if (p.isOp(':') && first.kind !== 'seq') {
      p.pos++;
      p.parseTest();
      let value: PyExpr | null = null;
      if (p.isOp('=')) {
        p.pos++;
        value = p.parseExprList();
      }
      const targets: string[] = [];
      p.dropTargetUses(first, targets);
      record({ line, targets, op: ':', value });
    } else if (p.peek()?.k === 'op' && /^(?:\*\*|\/\/|>>|<<|[-+*/%&|^@])=$/.test((p.peek() as Tok).v)) {
      const isPlus = (p.peek() as Tok).v === '+=';
      p.pos++;
      const value = p.parseExprList();
      const targets: string[] = [];
      p.dropTargetUses(first, targets);
      if (isPlus) record({ line, targets, op: '+=', value });
    }
    p.drain();
  }

  private parseDotted(part: Tok[], i: number): { module: string; next: number } {
    let module = '';
    let j = i;
    const head = part[j];
    if (head && head.k === 'name' && head.v !== 'import') {
      module = head.v;
      j++;
      for (;;) {
        const nx = part[j + 1];
        if (isOpTok(part[j], '.') && nx && nx.k === 'name') {
          module += '.' + nx.v;
          j += 2;
        } else break;
      }
    }
    return { module, next: j };
  }

  private parseImport(part: Tok[]): void {
    const line = (part[0] as Tok).line;
    let i = 1;
    while (i < part.length) {
      const { module, next } = this.parseDotted(part, i);
      if (!module) break;
      i = next;
      let alias: string | null = null;
      const asTok = part[i];
      const aliasTok = part[i + 1];
      if (isNameTok(asTok, 'as') && aliasTok && aliasTok.k === 'name') {
        alias = aliasTok.v;
        i += 2;
      }
      const imp: PyImport = { kind: 'import', line, level: 0, module, names: [], star: false, alias };
      this.out.imports.push(imp);
      if (isOpTok(part[i], ',')) i++;
      else break;
    }
  }

  private parseFrom(part: Tok[]): void {
    const line = (part[0] as Tok).line;
    let i = 1;
    let level = 0;
    while (isOpTok(part[i], '.')) {
      level++;
      i++;
    }
    const { module, next } = this.parseDotted(part, i);
    i = next;
    if (!isNameTok(part[i], 'import')) return;
    i++;
    const names: PyImportName[] = [];
    let star = false;
    if (isOpTok(part[i], '*')) {
      star = true;
    } else {
      if (isOpTok(part[i], '(')) i++;
      while (i < part.length) {
        const t = part[i] as Tok;
        if (isOpTok(t, ')')) break;
        if (isOpTok(t, ',')) {
          i++;
          continue;
        }
        if (t.k === 'name') {
          const asTok = part[i + 1];
          const aliasTok = part[i + 2];
          if (isNameTok(asTok, 'as') && aliasTok && aliasTok.k === 'name') {
            names.push({ name: t.v, alias: aliasTok.v });
            i += 3;
          } else {
            names.push({ name: t.v, alias: null });
            i++;
          }
        } else {
          i++;
        }
      }
    }
    this.out.imports.push({ kind: 'from', line, level, module, names, star, alias: null });
  }
}

// ------------------------------------------------------------------ entry --

/** Scan Python source into an outline. Never throws; malformed input yields a partial outline. */
export function scanPython(source: string): PyOutline {
  const out: PyOutline = { imports: [], functions: [], classes: [], assignments: [], calls: [], nameUses: [] };
  try {
    const src = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    new Builder(src, out).run(tokenize(src));
  } catch {
    // partial outline is the contract for unparseable input
  }
  return out;
}
