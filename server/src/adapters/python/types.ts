/**
 * Python indexing contracts (docs/plans/repo-intel-python.md §3.1).
 * Pure data shapes shared by scan / symbols / imports / facts / project.
 * This file must not import anything outside src/adapters/python.
 */

// ---------------------------------------------------------------- scanner --

export interface PyImportName {
  name: string;
  alias: string | null;
}

export interface PyImport {
  kind: 'import' | 'from';
  /** 1-based line of the statement's first token. */
  line: number;
  /** Leading dots of a `from` import (0 = absolute). Always 0 for kind 'import'. */
  level: number;
  /** Dotted module. '' for `from . import x`. One PyImport per module for `import a, b.c`. */
  module: string;
  /** kind 'from' only; [] for kind 'import' and for star imports. */
  names: PyImportName[];
  /** `from m import *`. */
  star: boolean;
  /** kind 'import' only: `import a.b as ab` → 'ab'; otherwise null. */
  alias: string | null;
}

export type PyExpr =
  | { kind: 'str'; value: string; line: number }
  | { kind: 'num'; value: string; line: number }
  | { kind: 'name'; dotted: string; line: number }
  | PyCall
  | { kind: 'seq'; items: PyExpr[]; line: number }
  | { kind: 'dict'; entries: PyDictEntry[]; line: number }
  | { kind: 'other'; text: string; line: number };

export interface PyCall {
  kind: 'call';
  /** Dotted text of the callee when it is a plain name chain (`views.X.as_view`), else ''. */
  callee: string;
  args: PyArg[];
  line: number;
  endLine: number;
}

export interface PyArg {
  /** Keyword name for `k=v`, else null. */
  keyword: string | null;
  star: '' | '*' | '**';
  value: PyExpr;
}

export interface PyDictEntry {
  /** null for a `**spread` entry. */
  key: PyExpr | null;
  value: PyExpr;
}

export interface PyDecorator {
  line: number;
  /** A 'name' (`@api_view`) or a 'call' (`@api_view(["GET"])`). */
  expr: PyExpr;
}

export interface PyFunction {
  name: string;
  line: number;
  /** Last non-blank line of the body (same line for one-liners). */
  endLine: number;
  async: boolean;
  decorators: PyDecorator[];
  /** Header text from `def`/`async def` to (excluding) the closing ':', whitespace collapsed, NOT length-trimmed. */
  signature: string;
}

export interface PyAssignment {
  line: number;
  /** Dotted plain-name targets (`x`, `app.conf.beat_schedule`); tuple/subscript targets are skipped. */
  targets: string[];
  op: '=' | '+=' | ':';
  /** null for a bare annotation `x: int`. */
  value: PyExpr | null;
}

export interface PyClass {
  name: string;
  line: number;
  endLine: number;
  /** Arguments of the class header (`class X(A, metaclass=M)`). */
  bases: PyArg[];
  decorators: PyDecorator[];
  /** `class Name(Bases)` header, whitespace collapsed, NOT length-trimmed. */
  signature: string;
  /** Defs directly in the class body. */
  methods: PyFunction[];
  /** Assignments directly in the class body. */
  assignments: PyAssignment[];
}

export interface PyNameUse {
  /** Longest plain name chain as written: 'foo' or 'views.contact_list'. */
  dotted: string;
  line: number;
  /** True when this chain is directly the callee of a call. */
  isCall: boolean;
}

export interface PyOutline {
  /** Every import statement at any depth (incl. inside functions / try blocks), source order. */
  imports: PyImport[];
  /** Module-level defs (not inside a def/class body; inside top-level if/try/with counts). */
  functions: PyFunction[];
  /** Module-level classes (same rule). */
  classes: PyClass[];
  /** Module-level assignments (same rule). */
  assignments: PyAssignment[];
  /** Every call expression at any depth, source order (nested calls appear separately). */
  calls: PyCall[];
  /**
   * Every name chain in expression position at any depth, EXCLUDING: tokens of import
   * statements, the declared name and parameter names of def/class headers, keyword-argument
   * names (`name=`), whole LHS targets of assignment statements, `global`/`nonlocal` lists.
   */
  nameUses: PyNameUse[];
}

// ---------------------------------------------------------- symbols/refs --

export interface PySymbol {
  name: string;
  kind: 'function' | 'class' | 'method';
  line: number;
  endLine: number;
  exported: boolean;
  signature: string | null;
}

export interface PyReference {
  toSymbol: string;
  line: number;
}

// ---------------------------------------------------------------- imports --

/** Opaque-ish lookup structure built once per project pass. */
export interface PyModuleIndex {
  /** Repo-relative POSIX paths of every indexed .py file. */
  files: ReadonlySet<string>;
  /** Ordered source roots ('' = repo root), see plan §3.3. */
  sourceRoots: readonly string[];
}

export interface PyFileEdge {
  from: string;
  to: string;
}

/** A resolved Python target: the file plus the symbol name inside it ('' = the module itself). */
export interface PyResolved {
  file: string;
  name: string;
}

/** Returns the imports of an already-scanned file ([] when unknown). */
export type PyImportsOf = (file: string) => readonly PyImport[];

// ------------------------------------------------------------------ facts --

export type PyTarget =
  /** A plain name chain written in code: 'views.contact_list', 'ContactViewSet'. */
  | { kind: 'expr'; dotted: string }
  /** A dotted string literal: 'apps.contacts.urls', 'apps.reports.tasks.send_weekly_report'. */
  | { kind: 'string'; dotted: string }
  /** A definition in the registering file itself (decorated function). */
  | { kind: 'local'; name: string };

export interface PyEndpointReg {
  /** Uppercase verb, or null = infer (Django) → ANY / view methods. */
  method: string | null;
  /** Route fragment exactly as written (prefixes applied later). */
  path: string;
  target: PyTarget | null;
  line: number;
}

export interface PyRouterReg {
  /** Local variable holding the router (`router`). */
  routerVar: string;
  /** Registered prefix as written (`r"contacts"`, value only). */
  prefix: string;
  viewset: PyTarget;
  line: number;
}

export interface PyIncludeReg {
  /** Route fragment of the enclosing path()/re_path(). */
  prefix: string;
  target: { kind: 'module'; ref: PyTarget } | { kind: 'router'; routerVar: string };
  line: number;
}

export interface PyCronReg {
  /** Rendered schedule: 5-field cron, 'every <n><s|m|h|d>', or 'schedule'. */
  schedule: string;
  /** Short label (task/function name). */
  label: string;
  target: PyTarget | null;
  line: number;
}

export interface PyFileRegistrations {
  file: string;
  endpoints: PyEndpointReg[];
  routers: PyRouterReg[];
  includes: PyIncludeReg[];
  crons: PyCronReg[];
  /** Fully rendered `job:<label>` facts declared in this file. */
  jobs: string[];
}

export interface PyViewAction {
  /** `url_path=` or the method name. */
  urlPath: string;
  detail: boolean;
  /** Uppercase, sorted; ['GET'] when `methods=` is absent. */
  methods: string[];
}

export interface PyViewInfo {
  /** Uppercase sorted verbs, or null = unknown → ANY. */
  methods: string[] | null;
  /** DRF @action methods (classes only). */
  actions: PyViewAction[];
}

export interface PyFactsResolver {
  resolveTarget(fromFile: string, target: PyTarget): PyResolved | null;
}

export interface PyFactsRow {
  filePath: string;
  /** Sorted, unique. */
  endpoints: string[];
  /** Sorted, unique. */
  crons: string[];
}

// ---------------------------------------------------------------- project --

export interface PythonProjectResult {
  edges: PyFileEdge[];
  /** One row per file with ≥1 fact. */
  facts: PyFactsRow[];
  /** Files that could not be read/scanned (never throws). */
  degraded: Array<{ file: string; reason: string }>;
  /** True when the deadline stopped the pass early. */
  truncated: boolean;
}
