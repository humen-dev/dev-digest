#!/usr/bin/env node
/**
 * dependency-checker — renders a snapshot JSON into the report skeleton.
 *
 *   node .claude/skills/dependency-checker/scripts/report.mjs <snapshot.json> [--out <file.md>]
 *
 * Every fact section (diagrams, tables, findings) is rendered here, deterministically.
 * Judgment sections are left as `<!-- AGENT: ... -->` markers that the agent replaces,
 * following references/report-format.md. Default output: docs/dependencies/<date>.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanBytes } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, '..', 'categories.json'), 'utf8'));
const argv = process.argv.slice(2);
const snapPath = argv.find((a) => !a.startsWith('--'));
if (!snapPath) { console.error('usage: report.mjs <snapshot.json> [--out <file.md>]'); process.exit(2); }
const S = JSON.parse(readFileSync(snapPath, 'utf8'));
const date = S.generatedAt.slice(0, 10);
const outIdx = argv.indexOf('--out');
const OUT = resolve(S.root, outIdx !== -1 ? argv[outIdx + 1] : `docs/dependencies/${date}.md`);

const TOP_N = CONFIG.thresholds.diagramTopN;
const CAT_LABEL = Object.fromEntries([...CONFIG.categories.map((c) => [c.id, c.label]), ['other', 'Other (unclassified)']]);
const B = humanBytes;
const id = (s) => String(s).replace(/[^A-Za-z0-9]/g, '_');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => rows.length
  ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
  : '_none_';
const count = (p) => S.findings.filter((f) => f.priority === p).length;
const usageLabel = (u) => [u.prodFiles && `prod ${u.prodFiles}`, u.testFiles && `test ${u.testFiles}`, u.configFiles && `cfg ${u.configFiles}`, u.scriptBins.length && `bin ${u.scriptBins.join('/')}`, u.implicit].filter(Boolean).join(', ') || '**none found**';
const pkgs = S.packages;

const L = [];
const push = (...xs) => L.push(...xs);

// ---------- header ----------
push(
  `# Dependency report — ${date}`,
  '',
  `> ${pkgs.length} packages · ${pkgs.reduce((a, p) => a + p.deps.length, 0)} direct dependencies · findings **P0 ${count('P0')} · P1 ${count('P1')} · P2 ${count('P2')} · P3 ${count('P3')}**  `,
  `> audit: ${S.options.audit ? 'run' : 'not run'} · outdated: ${S.options.outdated ? 'run' : 'not run'} · baseline: ${S.delta ? S.delta.baseline.slice(0, 10) : 'none'} · snapshot: \`${snapPath.replace(/\\/g, '/').replace(S.root + '/', '')}\``,
  '',
  '## 1. Summary',
  '',
  '<!-- AGENT: 3–5 bullets. Overall health verdict in one line first (healthy / needs attention / at risk), then the biggest risk, the biggest size win, and anything blocking. Each bullet cites finding IDs. -->',
  '',
);

// ---------- component map ----------
push('## 2. Component map', '', 'How the repo\'s packages depend on each other (tsconfig path aliases and vendored contracts — not npm installs).', '', '```mermaid', 'flowchart LR');
for (const p of pkgs) {
  const prodDeps = p.deps.filter((d) => d.kind === 'prod').length;
  push(`  ${id(p.dir)}["<b>${p.dir}</b><br/>${p.name}<br/>${p.manager} · ${prodDeps} prod / ${p.deps.length - prodDeps} dev<br/>prod ${B(p.prodBytes)}"]`);
}
const sharedEdges = S.internalEdges.filter((e) => e.to && e.alias === '@devdigest/shared');
if (sharedEdges.length) push('  shared{{"@devdigest/shared<br/>Zod contracts (vendored)"}}');
for (const e of S.internalEdges) {
  if (!e.to) continue;
  if (e.alias === '@devdigest/shared') {
    push(e.kind === 'vendored' ? `  ${id(e.from)} -. "vendored copy" .-> shared` : `  ${id(e.from)} -- "alias → ${e.to} copy" --> shared`);
  } else if (e.kind === 'source-alias') {
    push(`  ${id(e.from)} == "${e.alias} (source)" ==> ${id(e.to)}`);
  }
}
push('```', '');

// ---------- weight map ----------
push('## 3. Weight map', '', `Top ${TOP_N} production dependencies per package by installed closure size (dev dependencies when a package has no production ones). Closure = the package plus everything it pulls in.`, '', '```mermaid', 'flowchart LR');
for (const p of pkgs) {
  const prod = p.deps.filter((d) => (d.kind === 'prod' || d.kind === 'optional') && d.closureBytes != null);
  const pool = prod.length ? prod : p.deps.filter((d) => d.closureBytes != null);
  const top = [...pool].sort((a, b) => b.closureBytes - a.closureBytes).slice(0, TOP_N);
  const root = `${id(p.dir)}_root`;
  push(`  subgraph ${id(p.dir)}_w["${p.dir}"]`, '    direction LR', `    ${root}(["${p.dir}<br/>${prod.length ? 'prod' : 'dev only'} ${B(prod.length ? p.prodBytes : p.reachableBytes)}"])`);
  for (const d of top) {
    const heavy = prod.length && d.closureBytes >= CONFIG.thresholds.heavyProdClosureBytes;
    push(`    ${root} -->|"${B(d.closureBytes)}"| ${id(p.dir)}__${id(d.name)}["${d.name}<br/>${d.closurePackages} pkgs"]${heavy ? ':::heavy' : ''}`);
  }
  push('  end');
}
push('  classDef heavy fill:#fde2e1,stroke:#c0392b,color:#000', '```', '');

// ---------- size overview ----------
push('## 4. Size overview', '', table(
  ['Package', 'Manager', 'Prod / dev deps', 'Lockfile pkgs', 'Prod footprint', 'Full footprint', 'node_modules on disk', 'Unreachable'],
  pkgs.map((p) => {
    const prod = p.deps.filter((d) => d.kind === 'prod').length;
    return [p.dir, p.lockfiles.join('+') || 'none', `${prod} / ${p.deps.length - prod}`, p.lockPackages ?? 'n/a', B(p.prodBytes), B(p.reachableBytes), B(p.nodeModulesBytes), p.unreachableBytes > 1024 * 1024 ? `**${B(p.unreachableBytes)}**` : B(p.unreachableBytes)];
  }),
), '', '_Prod footprint_ = what a production-only install puts on disk. _Unreachable_ = bytes in node_modules that no declared dependency reaches (leftovers, other managers).', '');

// ---------- by type ----------
const cats = new Map();
for (const p of pkgs) for (const d of p.deps) {
  if (!cats.has(d.category)) cats.set(d.category, { n: 0, bytes: 0, names: new Set(), pk: new Set() });
  const c = cats.get(d.category);
  c.n += 1; c.bytes += d.selfBytes ?? 0; c.names.add(d.name); c.pk.add(p.dir);
}
push('## 5. Dependencies by type', '', table(
  ['Type', 'Declarations', 'Distinct packages', 'Own size (sum)', 'Used in', 'Examples'],
  [...cats.entries()].sort((a, b) => b[1].bytes - a[1].bytes).map(([k, c]) => [CAT_LABEL[k] ?? k, c.n, c.names.size, B(c.bytes), [...c.pk].join(', '), [...c.names].slice(0, 4).join(', ')]),
), '');
if (cats.has('other')) push('<!-- AGENT: classify every "Other" dependency in one line each (name → type, why), then propose the matching pattern for categories.json. -->', '');

// ---------- per package ----------
push('## 6. Per-package dependencies', '');
for (const p of pkgs) {
  const rows = [...p.deps].sort((a, b) => (b.closureBytes ?? -1) - (a.closureBytes ?? -1)).map((d) => [
    `\`${d.name}\``, d.kind, CAT_LABEL[d.category] ?? d.category, d.specifier, d.installedVersion ?? '—',
    B(d.selfBytes), d.closureBytes == null ? 'n/a' : `${B(d.closureBytes)} (${d.closurePackages})`, B(d.exclusiveBytes), usageLabel(d.usage), d.license ?? '—',
  ]);
  push(`### ${p.dir} — \`${p.name}\``, '', `${p.manager} · ${p.deps.length} direct · ${p.reachablePackages} installed packages reachable · prod ${B(p.prodBytes)} · full ${B(p.reachableBytes)}${p.installed ? '' : ' · **not installed — sizes unknown**'}`, '');
  push('<details><summary>Dependency table</summary>', '', table(['Dependency', 'Kind', 'Type', 'Specifier', 'Installed', 'Own', 'Closure (pkgs)', 'Exclusive', 'Usage', 'License'], rows), '', '</details>', '');
}
push('_Own_ = the package folder alone. _Closure_ = with all transitive deps. _Exclusive_ = what disappears if only this dependency is removed (shared transitive deps excluded). Sizes are install sizes on disk, **not** browser bundle sizes.', '');

// ---------- cross-package ----------
push('## 7. Shared across packages', '', table(
  ['Dependency', 'Packages', 'Versions (specifier → installed)', 'Drift'],
  S.crossPackage.map((c) => [`\`${c.name}\``, c.usedBy.length, c.usedBy.map((u) => `${u.package}: ${u.specifier}${u.installed ? ` → ${u.installed}` : ''}${u.kind !== 'prod' ? ` (${u.kind})` : ''}`).join('<br/>'), c.drift === 'none' ? 'aligned' : `**${c.drift}**`]),
), '');

// ---------- duplicates ----------
const dups = pkgs.flatMap((p) => p.duplicates.slice(0, 8).map((d) => [p.dir, `\`${d.name}\``, d.versions.join(', '), B(d.wasteBytes), d.inProd ? 'prod' : 'dev only']));
push('## 8. Duplicate versions inside a package', '', table(['Package', 'Dependency', 'Versions', 'Redundant size', 'Tree'], dups), '');

// ---------- security / freshness ----------
push('## 9. Security & freshness', '');
if (!S.options.audit && !S.options.outdated) {
  push('Not run — rerun the collector with `--audit --outdated` (network, read-only) to include vulnerabilities and available upgrades.', '');
} else {
  for (const p of pkgs) {
    if (p.audit?.error) push(`- **${p.dir}** audit failed: \`${p.audit.error.split('\n')[0]}\``);
    const vulns = p.audit?.vulns ?? [];
    const outd = (p.outdated?.items ?? []).filter((o) => o.latest && o.current !== o.latest);
    if (vulns.length) push('', `**${p.dir} — vulnerabilities**`, '', table(['Package', 'Worst severity', 'Advisories', 'Direct', 'Tree', 'Examples', 'Fixed in'], vulns.map((v) => [v.name, v.severity, v.advisories, v.direct ? 'yes' : 'no', v.inProd ? '**prod**' : 'dev only', v.title ?? '', v.fix ?? ''])));
    if (outd.length) push('', `**${p.dir} — outdated**`, '', table(['Package', 'Current', 'Wanted', 'Latest', 'Deprecated'], outd.map((o) => [o.name, o.current, o.wanted, o.latest, o.deprecated ? '**yes**' : ''])));
    if (!vulns.length && !outd.length && !p.audit?.error) push(`- **${p.dir}**: no advisories, nothing outdated.`);
  }
  push('');
}

// ---------- findings ----------
push('## 10. Findings (automated)', '', 'Produced by deterministic rules (see `references/priority-rules.md`). The agent verifies each before it enters the action plan.', '', table(
  ['ID', 'P', 'Rule', 'Package', 'Dependency', 'Finding', 'Evidence'],
  S.findings.map((f) => [f.id, f.priority, f.rule, f.package ?? '—', f.dep ? `\`${f.dep}\`` : '—', f.message, f.evidence ?? '']),
), '');
push('<!-- AGENT: list any finding you verified as a false positive here ("F07 — false positive: <reason>") and drop it from the plan. -->', '');

// ---------- judgment ----------
push(
  '## 11. Prioritized action plan', '',
  '<!-- AGENT: table | # | P | Action | Findings | Impact | Effort | Command / change |. Order by priority, then impact/effort. Every row cites finding IDs and gives a concrete command or edit for the right package manager (pnpm for pnpm-lock packages, npm for package-lock packages). Never run the commands. -->', '',
  '## 12. Recommendations', '',
  '<!-- AGENT: grouped advice beyond single findings — Security · Size & performance · Consistency across packages · Hygiene & process. 2–4 bullets per group, each tied to evidence in this report. -->', '',
);

// ---------- delta ----------
if (S.delta) {
  push('## 13. Change since baseline', '', table(
    ['Package', 'Prod Δ', 'Full Δ', 'Added', 'Removed', 'Version changes'],
    S.delta.packages.map((d) => d.status === 'new' ? [d.dir, 'new', '', '', '', ''] : [
      d.dir, d.prodBytesDelta == null ? 'n/a' : `${d.prodBytesDelta >= 0 ? '+' : '−'}${B(Math.abs(d.prodBytesDelta))}`, `${d.reachableBytesDelta >= 0 ? '+' : '−'}${B(Math.abs(d.reachableBytesDelta))}`,
      d.added.join(', ') || '—', d.removed.join(', ') || '—', d.upgraded.slice(0, 6).join('<br/>') || '—',
    ]),
  ), '', `Findings: ${S.delta.findingsDelta.before} → ${S.delta.findingsDelta.after}.`, '');
}

push('## Method & caveats', '',
  '- Sizes are measured on disk from the installed `node_modules` (symlinks followed once, nested `node_modules` excluded per package). Browser bundle size differs — tree-shaking removes most of e.g. an icon library.',
  '- Usage is a static text scan of source, config, stylesheet, package scripts and CI files for the package name or its binaries. Dynamic `require(variable)` and plugin names built at runtime are invisible — treat `possibly-unused` as a lead, not a verdict.',
  '- Internal edges come from `tsconfig.json` `paths`; this repo shares code through aliases and vendored copies, not workspace installs.',
  '');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, L.join('\n'));
const markers = (L.join('\n').match(/<!-- AGENT:/g) ?? []).length;
console.log(`report skeleton: ${OUT.replace(/\\/g, '/').replace(S.root + '/', '')} (${markers} AGENT sections to fill)`);
