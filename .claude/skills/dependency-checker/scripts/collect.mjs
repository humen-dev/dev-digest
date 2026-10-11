#!/usr/bin/env node
/**
 * dependency-checker — fact collector.
 *
 *   node .claude/skills/dependency-checker/scripts/collect.mjs [options]
 *
 *   --root <dir>        repo root (default: git toplevel of cwd, else cwd)
 *   --packages a,b      only these package dirs (relative to root)
 *   --audit             run `npm audit` / `pnpm audit` per package (network, read-only)
 *   --outdated          run `npm outdated` / `pnpm outdated` per package (network, read-only)
 *   --out <file>        snapshot path (default: docs/dependencies/snapshots/YYYY-MM-DD.json)
 *   --baseline <file>   previous snapshot to diff against (default: newest older snapshot)
 *   --no-baseline       skip the diff
 *
 * Read-only for the repo except the snapshot file. Never installs, never touches
 * lockfiles. Prints a short summary; the full facts are in the snapshot JSON.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFile, closureOf, discoverPackages, humanBytes, isLooseSpecifier, listSourceFiles,
  majorLine, manifestOf, packageSize, posix, readJson, readText, rel, resolvePackage,
  safeRealpath, specifierBase, sumSizes, treeSize,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = readJson(join(HERE, '..', 'categories.json'));

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i !== -1 ? argv[i + 1] : undefined; };

function gitRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
const ROOT = resolve(opt('root') ?? gitRoot() ?? process.cwd());
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(ROOT, opt('out') ?? `docs/dependencies/snapshots/${today}.json`);

// ---------- classification ----------
const CATS = CONFIG.categories.map((c) => ({ ...c, res: c.patterns.map((p) => new RegExp(p)) }));
const categoryOf = (name) => CATS.find((c) => c.res.some((r) => r.test(name)))?.id ?? 'other';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- per-package analysis ----------
function detectManager(dir) {
  const pnpm = existsSync(join(dir, 'pnpm-lock.yaml'));
  const npm = existsSync(join(dir, 'package-lock.json'));
  const yarn = existsSync(join(dir, 'yarn.lock'));
  const all = [pnpm && 'pnpm', npm && 'npm', yarn && 'yarn'].filter(Boolean);
  return { manager: all[0] ?? 'none', lockfiles: all };
}

function lockPackageCount(dir, manager) {
  if (manager === 'npm') {
    const lock = readJson(join(dir, 'package-lock.json'));
    return lock?.packages ? Object.keys(lock.packages).filter((k) => k).length : null;
  }
  if (manager === 'pnpm') {
    const text = readText(join(dir, 'pnpm-lock.yaml'));
    if (!text) return null;
    const start = text.indexOf('\npackages:');
    if (start === -1) return 0;
    const end = text.indexOf('\nsnapshots:', start);
    const block = text.slice(start, end === -1 ? undefined : end);
    return (block.match(/^ {2}\S.*:\s*$/gm) ?? []).length;
  }
  return null;
}

function tsconfigAliases(dir) {
  const text = readText(join(dir, 'tsconfig.json'));
  if (!text) return [];
  const m = text.match(/"paths"\s*:\s*(\{[\s\S]*?\n\s*\})/);
  if (!m) return [];
  let paths;
  try { paths = JSON.parse(m[1].replace(/,(\s*[}\]])/g, '$1')); } catch { return []; }
  return Object.entries(paths).map(([alias, targets]) => ({ alias, target: posix(targets[0] ?? '') }));
}

function binMap(deps, pkgDir) {
  const map = new Map(); // bin name -> dep name
  for (const d of deps) {
    if (!d.real) continue;
    const m = manifestOf(d.real);
    const bins = typeof m.bin === 'string' ? { [basename(m.name ?? d.name)]: m.bin } : (m.bin ?? {});
    for (const b of Object.keys(bins)) map.set(b, d.name);
  }
  return map;
}

function scanUsage(pkgDir, deps) {
  const files = listSourceFiles(pkgDir);
  const usage = new Map(deps.map((d) => [d.name, { prod: 0, test: 0, config: 0, examples: [] }]));
  const res = deps.map((d) => [d.name, new RegExp(`['"\`]${escapeRe(d.name)}(?:/[^'"\`\\s]*)?['"\`]`)]);
  // tsconfig "types": ["node", "vitest/globals"] style references
  const typeRefs = new Set();
  for (const f of files) {
    const text = readText(f);
    if (!text) continue;
    // stylesheets are build input, never runtime imports — they count as config usage
    const kind = /\.s?css$/.test(f) ? 'config' : classifyFile(rel(pkgDir, f));
    if (/^tsconfig.*\.json$/.test(basename(f))) {
      const t = text.match(/"types"\s*:\s*\[([^\]]*)\]/);
      if (t) for (const x of t[1].matchAll(/"([^"]+)"/g)) typeRefs.add(x[1].split('/')[0]);
    }
    for (const [name, re] of res) {
      if (re.test(text)) {
        const u = usage.get(name);
        u[kind] += 1;
        if (u.examples.length < 3) u.examples.push(rel(pkgDir, f));
      }
    }
  }
  return { usage, typeRefs, fileCount: files.length };
}

function scriptBinUsage(pkgDir, manifest, bins) {
  const texts = [JSON.stringify(manifest.scripts ?? {})];
  const pkgRel = rel(ROOT, pkgDir);
  for (const extraDir of [join(ROOT, '.github', 'workflows'), join(ROOT, 'scripts'), join(pkgDir, 'scripts')]) {
    if (!existsSync(extraDir)) continue;
    for (const f of readdirSync(extraDir)) {
      const t = readText(join(extraDir, f));
      // root-level files only count if they mention this package's directory
      if (t && (extraDir.startsWith(pkgDir) || t.includes(pkgRel))) texts.push(t);
    }
  }
  const joined = texts.join('\n');
  const used = new Map();
  for (const [bin, dep] of bins) {
    if (new RegExp(`(?:^|[\\s"'\`;&|(])${escapeRe(bin)}(?=[\\s"'\`;&|)]|$)`, 'm').test(joined)) {
      if (!used.has(dep)) used.set(dep, []);
      used.get(dep).push(bin);
    }
  }
  return used;
}

function analyzePackage(dir) {
  const manifest = readJson(join(dir, 'package.json')) ?? {};
  const { manager, lockfiles } = detectManager(dir);
  const nm = join(dir, 'node_modules');
  const installed = existsSync(nm);
  const realDir = safeRealpath(dir) ?? dir;

  const kinds = [
    ['prod', manifest.dependencies], ['dev', manifest.devDependencies],
    ['peer', manifest.peerDependencies], ['optional', manifest.optionalDependencies],
  ];
  const deps = [];
  for (const [kind, map] of kinds) {
    for (const [name, specifier] of Object.entries(map ?? {})) {
      const real = installed ? resolvePackage(realDir, name) : null;
      const m = real ? manifestOf(real) : {};
      deps.push({ name, kind, specifier, real, installedVersion: m.version ?? null, license: m.license ?? null, deprecated: m.deprecated ?? null, category: categoryOf(name) });
    }
  }

  // sizes + closures
  const allDirs = new Set();
  const prodDirs = new Set();
  for (const d of deps) {
    if (!d.real) continue;
    const own = packageSize(d.real);
    const closure = closureOf(d.real);
    d.selfBytes = own.bytes;
    d.files = own.files;
    d.closureBytes = sumSizes(closure);
    d.closurePackages = closure.size;
    d._closure = closure;
    for (const c of closure) { allDirs.add(c); if (d.kind === 'prod' || d.kind === 'optional') prodDirs.add(c); }
  }

  // exclusive weight: what would leave the tree if only this dep were removed
  for (const d of deps) {
    if (!d._closure) continue;
    const others = new Set();
    for (const o of deps) if (o !== d && o._closure) for (const c of o._closure) others.add(c);
    d.exclusiveBytes = sumSizes([...d._closure].filter((c) => !others.has(c)));
  }

  // duplicates: same package name, several versions in the installed tree
  const byName = new Map();
  for (const c of allDirs) {
    const m = manifestOf(c);
    if (!m.name) continue;
    if (!byName.has(m.name)) byName.set(m.name, new Map());
    byName.get(m.name).set(m.version, (byName.get(m.name).get(m.version) ?? 0) + packageSize(c).bytes);
  }
  const duplicates = [];
  for (const [name, versions] of byName) {
    if (versions.size < 2) continue;
    const sizes = [...versions.values()].sort((a, b) => b - a);
    const inProd = [...prodDirs].some((c) => manifestOf(c).name === name);
    duplicates.push({ name, versions: [...versions.keys()].sort(), wasteBytes: sizes.slice(1).reduce((a, b) => a + b, 0), inProd });
  }
  duplicates.sort((a, b) => b.wasteBytes - a.wasteBytes);

  const realByName = new Map(deps.filter((d) => d.real).map((d) => [d.name, d.real]));
  // usage
  const { usage, typeRefs, fileCount } = scanUsage(dir, deps);
  const binUse = scriptBinUsage(dir, manifest, binMap(deps, dir));
  for (const d of deps) {
    const u = usage.get(d.name);
    d.usage = { prodFiles: u.prod, testFiles: u.test, configFiles: u.config, examples: u.examples, scriptBins: binUse.get(d.name) ?? [], implicit: null };
    if (d.name.startsWith('@types/')) {
      const base = d.name.slice(7).replace(/^(.+)__(.+)$/, '@$1/$2');
      const baseDep = deps.find((x) => x.name === base);
      if (base === 'node' || typeRefs.has(base) || (baseDep && baseDep.usage)) d.usage.implicit = `types for ${base}`;
      else if (deps.some((x) => x.name === base)) d.usage.implicit = `types for ${base}`;
    }
    if (typeRefs.has(d.name)) d.usage.implicit = d.usage.implicit ?? 'tsconfig types';
    // a peer of another direct dep is used through it (postcss for @tailwindcss/postcss)
    const host = realByName.size && deps.find((o) => o !== d && realByName.get(o.name) && manifestOf(realByName.get(o.name)).peerDependencies?.[d.name]);
    if (host) d.usage.implicit = d.usage.implicit ?? `peer of ${host.name}`;
    const provider = deps.find((o) => o !== d && realByName.get(o.name) && manifestOf(realByName.get(o.name)).dependencies?.[d.name]);
    if (provider) d.providedBy = provider.name;
  }

  const nodeModulesBytes = installed ? treeSize(nm) : null;
  const strayDirs = installed ? readdirSync(nm).filter((n) => (n === '.pnpm' && manager !== 'pnpm') || n.startsWith('.ignored_') || (n === '.package-lock.json' && manager === 'pnpm')) : [];
  const result = {
    name: manifest.name ?? basename(dir), dir: rel(ROOT, dir), manager, lockfiles,
    unreachableBytes: nodeModulesBytes == null ? null : Math.max(0, nodeModulesBytes - sumSizes(allDirs)), strayDirs,
    lockPackages: lockPackageCount(dir, lockfiles[0]), installed,
    nodeModulesBytes,
    reachableBytes: sumSizes(allDirs), reachablePackages: allDirs.size,
    prodBytes: sumSizes(prodDirs), prodPackages: prodDirs.size,
    sourceFiles: fileCount, engines: manifest.engines ?? null,
    aliases: tsconfigAliases(dir),
    deps: deps.map(({ real, _closure, ...rest }) => rest),
    duplicates,
  };
  Object.defineProperty(result, 'prodNames', { value: new Set([...prodDirs].map((c) => manifestOf(c).name)), enumerable: false });
  return result;
}

// ---------- external tools (opt-in, network) ----------
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
  try { return { ok: true, json: JSON.parse(r.stdout || 'null') }; } catch { return { ok: false, error: (r.stderr || r.stdout || '').slice(0, 400) }; }
}

const SEV = ['info', 'low', 'moderate', 'high', 'critical'];
/** One entry per vulnerable package: worst severity, advisory count, prod reachability. */
function groupVulns(pkg, raw) {
  const by = new Map();
  for (const v of raw) {
    const g = by.get(v.name) ?? { name: v.name, severity: 'info', advisories: 0, direct: v.direct, titles: [], fixes: new Set() };
    if (SEV.indexOf(v.severity) > SEV.indexOf(g.severity)) g.severity = v.severity;
    g.advisories += 1;
    if (g.titles.length < 3 && v.title) g.titles.push(v.title);
    if (v.fix && v.fix !== 'none') g.fixes.add(v.fix);
    by.set(v.name, g);
  }
  return [...by.values()].map((g) => ({
    name: g.name, severity: g.severity, advisories: g.advisories, direct: g.direct,
    inProd: pkg.prodNames.has(g.name), title: g.titles.join('; '),
    fix: [...g.fixes].sort().pop() ?? 'none',
  })).sort((a, b) => SEV.indexOf(b.severity) - SEV.indexOf(a.severity) || Number(b.inProd) - Number(a.inProd));
}

function audit(pkg) {
  const r = auditRaw(pkg);
  return r.vulns ? { vulns: groupVulns(pkg, r.vulns) } : r;
}

function auditRaw(pkg) {
  const cwd = join(ROOT, pkg.dir);
  if (pkg.manager === 'npm') {
    const r = run('npm', ['audit', '--json'], cwd);
    if (!r.ok || !r.json) return { error: r.error ?? 'no output' };
    return { vulns: Object.values(r.json.vulnerabilities ?? {}).map((v) => ({
      name: v.name, severity: v.severity, direct: !!v.isDirect, range: v.range,
      title: (v.via ?? []).map((x) => (typeof x === 'string' ? x : x.title)).filter(Boolean).slice(0, 2).join('; '),
      fix: v.fixAvailable === true ? 'available' : v.fixAvailable ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (major)' : ''}` : 'none',
    })) };
  }
  if (pkg.manager === 'pnpm') {
    const r = run('pnpm', ['audit', '--json'], cwd);
    if (!r.ok || !r.json) return { error: r.error ?? 'no output' };
    const direct = new Set(pkg.deps.map((d) => d.name));
    return { vulns: Object.values(r.json.advisories ?? {}).map((a) => ({
      name: a.module_name, severity: a.severity, direct: direct.has(a.module_name), range: a.vulnerable_versions,
      title: a.title, fix: a.patched_versions ?? 'none',
      via: (a.findings ?? []).flatMap((f) => f.paths ?? []).slice(0, 2),
    })) };
  }
  return { error: `no lockfile — audit skipped` };
}

function outdated(pkg) {
  const cwd = join(ROOT, pkg.dir);
  const r = pkg.manager === 'pnpm' ? run('pnpm', ['outdated', '--format', 'json'], cwd) : pkg.manager === 'npm' ? run('npm', ['outdated', '--json'], cwd) : { ok: false, error: 'no lockfile' };
  if (!r.ok) return { error: r.error };
  return { items: Object.entries(r.json ?? {}).map(([name, v]) => ({ name, current: v.current ?? null, wanted: v.wanted ?? null, latest: v.latest ?? null, deprecated: !!v.isDeprecated })) };
}

// ---------- findings (deterministic rules; the agent may re-rank with reasons) ----------
function buildFindings(packages, cross, internal) {
  const out = [];
  const add = (f) => out.push(f);
  const T = CONFIG.thresholds;
  const shared = new Set(CONFIG.sharedContractLibs);

  for (const p of packages) {
    if (!p.installed) add({ priority: 'P2', rule: 'not-installed', package: p.dir, message: 'node_modules missing — sizes, closures and duplicates are unknown for this package.' });
    if (p.lockfiles.length === 0) add({ priority: 'P1', rule: 'no-lockfile', package: p.dir, message: 'No lockfile — installs are not reproducible.' });
    if (p.strayDirs.length || p.unreachableBytes > 10 * 1024 * 1024) add({ priority: 'P2', rule: 'stray-install', package: p.dir, evidence: p.strayDirs.join(', ') || 'unreferenced packages', message: `node_modules holds ${humanBytes(p.unreachableBytes)} that no declared dependency reaches${p.strayDirs.length ? ` (leftovers of another package manager: ${p.strayDirs.join(', ')})` : ''} — reinstall cleanly with ${p.manager === 'npm' ? 'npm ci' : `${p.manager} install --frozen-lockfile`}.` });
    if (p.lockfiles.length > 1) add({ priority: 'P2', rule: 'multiple-lockfiles', package: p.dir, message: `Several lockfiles (${p.lockfiles.join(', ')}) — managers will disagree.` });

    for (const d of p.deps) {
      const u = d.usage;
      const anyUse = u.prodFiles + u.testFiles + u.configFiles + u.scriptBins.length > 0 || u.implicit;
      const evidence = [d.providedBy && `also installed transitively via ${d.providedBy}`, u.prodFiles && `${u.prodFiles} prod files`, u.testFiles && `${u.testFiles} test files`, u.configFiles && `${u.configFiles} config/script/style files`, u.scriptBins.length && `bins: ${u.scriptBins.join(', ')}`, u.implicit].filter(Boolean).join(' · ') || 'no references found';
      const base = { package: p.dir, dep: d.name, evidence };

      if (d.deprecated) add({ ...base, priority: 'P1', rule: 'deprecated', message: `Installed ${d.name}@${d.installedVersion} is deprecated: ${String(d.deprecated).slice(0, 160)}` });
      if (!anyUse && d.kind !== 'peer') add({ ...base, priority: d.kind === 'prod' ? 'P1' : 'P2', rule: 'possibly-unused', message: `Declared in ${d.kind} but no import, string reference, config or script usage was found.` });
      if (d.kind === 'dev' && u.prodFiles > 0 && d.category !== 'types' && d.category !== 'build' && d.category !== 'testing') add({ ...base, priority: 'P1', rule: 'dev-used-in-prod', message: `Imported from production code but declared in devDependencies — breaks a production-only install.` });
      if (d.kind === 'prod' && u.prodFiles === 0 && anyUse && (d.category === 'testing' || d.category === 'build' || d.category === 'types' || u.testFiles + u.configFiles + u.scriptBins.length > 0)) {
        add({ ...base, priority: 'P2', rule: 'tooling-in-prod', message: `In dependencies but used only by tests/config/scripts — inflates the production install${d.closureBytes ? ` by up to ${humanBytes(d.exclusiveBytes)}` : ''}.` });
      }
      if (d.kind === 'prod' && d.category === 'types') add({ ...base, priority: 'P3', rule: 'types-in-prod', message: '@types package in dependencies — belongs in devDependencies.' });
      if (isLooseSpecifier(d.specifier)) add({ ...base, priority: 'P3', rule: 'loose-specifier', message: `Specifier "${d.specifier}" is open-ended or non-registry.` });
      if (d.installedVersion && specifierBase(d.specifier) && majorLine(d.installedVersion) !== majorLine(specifierBase(d.specifier)) && /^[\^~]/.test(d.specifier)) {
        add({ ...base, priority: 'P2', rule: 'stale-install', message: `Installed ${d.installedVersion} does not match specifier ${d.specifier} — node_modules is out of sync with package.json.` });
      }
      if ((d.kind === 'prod' || d.kind === 'optional') && d.closureBytes >= T.heavyProdClosureBytes) add({ ...base, priority: 'P2', rule: 'heavy-prod-dep', message: `Production dependency pulls ${humanBytes(d.closureBytes)} across ${d.closurePackages} packages (exclusive ${humanBytes(d.exclusiveBytes)}).` });
    }
    for (const dup of p.duplicates) {
      if (dup.wasteBytes < T.duplicateWasteBytes && !shared.has(dup.name)) continue;
      add({ priority: shared.has(dup.name) ? 'P1' : dup.inProd ? 'P2' : 'P3', rule: 'duplicate-versions', package: p.dir, dep: dup.name, evidence: dup.versions.join(', '), message: `${dup.versions.length} versions installed side by side (${humanBytes(dup.wasteBytes)} redundant${dup.inProd ? ', in the production tree' : ', dev tooling only'})${shared.has(dup.name) ? ' — a shared-contract library; instances may not be interchangeable' : ''}.` });
    }
    for (const v of p.audit?.vulns ?? []) {
      const hi = v.severity === 'critical' || v.severity === 'high';
      const pri = hi && v.inProd ? 'P0' : hi ? 'P1' : v.severity === 'moderate' ? (v.inProd ? 'P2' : 'P3') : 'P3';
      add({ priority: pri, rule: 'vulnerability', package: p.dir, dep: v.name, evidence: `${v.severity} · ${v.advisories} advisor${v.advisories === 1 ? 'y' : 'ies'} · ${v.direct ? 'direct' : 'transitive'} · ${v.inProd ? 'prod tree' : 'dev only'} · fix: ${v.fix}`, message: v.title || `${v.severity} advisory in ${v.name}` });
    }
    for (const o of p.outdated?.items ?? []) {
      if (o.deprecated) add({ priority: 'P1', rule: 'deprecated', package: p.dir, dep: o.name, message: `Registry marks ${o.name}@${o.current} deprecated.` });
      else if (o.current && o.latest && majorLine(o.current) !== majorLine(o.latest)) add({ priority: 'P3', rule: 'outdated-major', package: p.dir, dep: o.name, evidence: `${o.current} → ${o.latest}`, message: `A new major line is available (${o.latest}).` });
    }
  }

  for (const c of cross) {
    if (c.drift === 'none') continue;
    const isShared = shared.has(c.name);
    const pri = c.drift === 'major' ? (isShared ? 'P1' : 'P2') : (isShared ? 'P2' : 'P3');
    add({ priority: pri, rule: 'version-drift', dep: c.name, evidence: c.usedBy.map((u) => `${u.package}: ${u.specifier}${u.installed ? ` (${u.installed})` : ''}`).join(' · '), message: `${c.drift} version drift across packages${isShared ? ' — shared contracts (vendored @devdigest/shared) compile against each copy' : ''}.` });
  }

  for (const e of internal) {
    if (e.kind === 'alias-into-node_modules') add({ priority: 'P3', rule: 'alias-pins-node_modules', package: e.from, dep: e.alias, evidence: `${e.alias} → ${e.target}`, message: 'tsconfig path alias points into node_modules to force a single copy — a symptom of duplicate instances; keep versions aligned with the alias owner.' });
  }

  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  // ids follow priority order, so F01 is always the most severe finding
  const pad = String(out.length).length < 2 ? 2 : String(out.length).length;
  return out.sort((a, b) => order[a.priority] - order[b.priority]).map((f, i) => ({ id: `F${String(i + 1).padStart(pad, '0')}`, ...f }));
}

// ---------- cross-package + internal graph ----------
function crossPackage(packages) {
  const map = new Map();
  for (const p of packages) for (const d of p.deps) {
    if (!map.has(d.name)) map.set(d.name, []);
    map.get(d.name).push({ package: p.dir, kind: d.kind, specifier: d.specifier, installed: d.installedVersion });
  }
  const out = [];
  for (const [name, usedBy] of map) {
    if (usedBy.length < 2) continue;
    const versions = usedBy.map((u) => u.installed ?? specifierBase(u.specifier)).filter(Boolean);
    const majors = new Set(versions.map(majorLine));
    const exact = new Set(versions);
    out.push({ name, usedBy, drift: majors.size > 1 ? 'major' : exact.size > 1 ? 'minor' : 'none' });
  }
  return out.sort((a, b) => b.usedBy.length - a.usedBy.length || a.name.localeCompare(b.name));
}

function internalGraph(packages) {
  const edges = [];
  for (const p of packages) {
    for (const a of p.aliases) {
      if (!a.target || a.target.startsWith('./src') && !a.target.includes('vendor')) continue;
      const abs = posix(resolve(ROOT, p.dir, a.target));
      if (a.target.includes('node_modules')) { edges.push({ from: p.dir, to: null, alias: a.alias, target: a.target, kind: 'alias-into-node_modules' }); continue; }
      const owner = packages.find((q) => q.dir !== '.' && abs.startsWith(posix(resolve(ROOT, q.dir)) + '/'));
      if (!owner) continue;
      const kind = owner.dir === p.dir ? 'vendored' : 'source-alias';
      const alias = a.alias.replace(/\/\*$/, ''); // `x` and `x/*` are one edge
      if (edges.some((e) => e.from === p.dir && e.to === owner.dir && e.alias === alias)) continue;
      edges.push({ from: p.dir, to: owner.dir, alias, target: a.target, kind });
    }
  }
  return edges;
}

// ---------- baseline diff ----------
function newestOlderSnapshot() {
  const dir = dirname(OUT);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && join(dir, f) !== OUT).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

function diff(prev, cur) {
  const out = { baseline: prev.generatedAt, packages: [] };
  for (const p of cur.packages) {
    const q = prev.packages.find((x) => x.dir === p.dir);
    if (!q) { out.packages.push({ dir: p.dir, status: 'new' }); continue; }
    const key = (d) => `${d.kind}:${d.name}`;
    const before = new Map(q.deps.map((d) => [key(d), d]));
    const after = new Map(p.deps.map((d) => [key(d), d]));
    out.packages.push({
      dir: p.dir,
      prodBytesDelta: p.prodBytes != null && q.prodBytes != null ? p.prodBytes - q.prodBytes : null,
      reachableBytesDelta: p.reachableBytes - (q.reachableBytes ?? 0),
      added: [...after.keys()].filter((k) => !before.has(k)),
      removed: [...before.keys()].filter((k) => !after.has(k)),
      upgraded: [...after.entries()].filter(([k, d]) => before.has(k) && before.get(k).installedVersion !== d.installedVersion).map(([k, d]) => `${k} ${before.get(k).installedVersion} → ${d.installedVersion}`),
    });
  }
  out.findingsDelta = { before: prev.findings?.length ?? 0, after: cur.findings.length };
  return out;
}

// ---------- main ----------
const only = opt('packages')?.split(',').map((s) => posix(s.trim()).replace(/\/$/, ''));
let dirs = discoverPackages(ROOT).filter((d) => !only || only.includes(rel(ROOT, d)));
const packages = [];
for (const d of dirs) {
  const started = Date.now();
  const p = analyzePackage(d);
  if (flag('audit')) p.audit = audit(p);
  if (flag('outdated')) p.outdated = outdated(p);
  p.analysisMs = Date.now() - started;
  packages.push(p);
}
const cross = crossPackage(packages);
const internal = internalGraph(packages);
const snapshot = {
  tool: 'dependency-checker', version: '1.0.0', generatedAt: new Date().toISOString(), root: posix(ROOT),
  options: { audit: flag('audit'), outdated: flag('outdated'), packages: only ?? 'all' },
  packages, crossPackage: cross, internalEdges: internal,
};
snapshot.findings = buildFindings(packages, cross, internal);
if (!flag('no-baseline')) {
  const base = opt('baseline') ? resolve(ROOT, opt('baseline')) : newestOlderSnapshot();
  const prev = base ? readJson(base) : null;
  if (prev?.packages) snapshot.delta = diff(prev, snapshot);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

const count = (p) => snapshot.findings.filter((f) => f.priority === p).length;
console.log(`dependency-checker: ${packages.length} packages · ${packages.reduce((a, p) => a + p.deps.length, 0)} direct deps · findings P0=${count('P0')} P1=${count('P1')} P2=${count('P2')} P3=${count('P3')}`);
for (const p of packages) console.log(`  ${p.dir.padEnd(16)} ${p.manager.padEnd(5)} deps=${String(p.deps.length).padEnd(3)} prod=${humanBytes(p.prodBytes).padEnd(9)} reachable=${humanBytes(p.reachableBytes).padEnd(9)} node_modules=${humanBytes(p.nodeModulesBytes)}${p.audit?.error ? `  audit: ${p.audit.error.split('\n')[0]}` : ''}`);
console.log(`snapshot: ${rel(ROOT, OUT)}${snapshot.delta ? ` (diffed against ${snapshot.delta.baseline})` : ''}`);
