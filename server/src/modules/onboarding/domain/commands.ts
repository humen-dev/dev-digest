/**
 * Pure grounding rules for a model-proposed how-to-run command against the
 * repository's command source files (SPEC-03 Definitions "Grounded
 * command", rules 1-8). No I/O: `sources` is the caller's materialized map
 * of command source path → file text.
 */

/** Collapses runs of whitespace to one space and trims (rule 1 only). */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

/**
 * Rule 1: the command appears verbatim in a command source file, ignoring
 * runs of whitespace. Commands such as `curl … | sh` or `sudo …` are kept
 * under this rule.
 */
function groundVerbatim(command: string, sources: ReadonlyMap<string, string>): string | null {
  const needle = collapseWhitespace(command);
  if (!needle) return null;
  for (const [path, text] of sources) {
    if (collapseWhitespace(text).includes(needle)) return path;
  }
  return null;
}

function findPackageJson(sources: ReadonlyMap<string, string>): { path: string; text: string } | null {
  for (const [path, text] of sources) {
    if (basename(path) === 'package.json') return { path, text };
  }
  return null;
}

/**
 * Tolerant parse of `package.json`'s `scripts` keys: real JSON first, then
 * a regex fallback over the `"scripts": { … }` block. A parse failure
 * (neither succeeds) means the rule does not match — returns `null`, not an
 * empty set, so callers can tell "no scripts" from "could not read".
 */
function extractPackageJsonScripts(text: string): ReadonlySet<string> | null {
  try {
    const data: unknown = JSON.parse(text);
    if (data && typeof data === 'object' && 'scripts' in data) {
      const scripts = (data as { scripts?: unknown }).scripts;
      if (scripts && typeof scripts === 'object') return new Set(Object.keys(scripts));
    }
    return new Set();
  } catch {
    const match = /"scripts"\s*:\s*\{(?<body>[^}]*)\}/s.exec(text);
    const body = match?.groups?.body;
    if (body === undefined) return null;
    const keys: string[] = [];
    for (const m of body.matchAll(/"(?<key>[^"]+)"\s*:/g)) {
      if (m.groups?.key !== undefined) keys.push(m.groups.key);
    }
    return new Set(keys);
  }
}

const PM_RE = /^(npm|pnpm|yarn|bun)$/;

/** Rule 2: `<pm> install` or `<pm> i`, with a `package.json` present. */
function groundPmInstall(command: string, sources: ReadonlyMap<string, string>): string | null {
  const m = /^(npm|pnpm|yarn|bun)\s+(install|i)$/.exec(command.trim());
  if (!m) return null;
  return findPackageJson(sources)?.path ?? null;
}

/** Rule 3: `<pm> run <s>` or `<pm> <s>`, where `s` is a key of `package.json`'s `scripts`. */
function groundPmScript(command: string, sources: ReadonlyMap<string, string>): string | null {
  const parts = command.trim().split(/\s+/);
  const pm = parts[0];
  if (!pm || !PM_RE.test(pm)) return null;
  const rest = parts.slice(1);

  let script: string | undefined;
  if (rest.length === 2 && rest[0] === 'run') script = rest[1];
  else if (rest.length === 1 && rest[0] !== 'install' && rest[0] !== 'i') script = rest[0];
  if (!script) return null;

  const pkg = findPackageJson(sources);
  if (!pkg) return null;
  const scripts = extractPackageJsonScripts(pkg.text);
  return scripts?.has(script) ? pkg.path : null;
}

/** Tolerant parse of a Makefile's targets (lines like `target:` or `target: deps`). */
function extractMakeTargets(text: string): ReadonlySet<string> | null {
  const targets = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^(?<target>[A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/.exec(line);
    if (m?.groups?.target !== undefined) targets.add(m.groups.target);
  }
  return targets.size > 0 ? targets : null;
}

/** Rule 4: `make <t>`, where `t` is a Makefile target. */
function groundMake(command: string, sources: ReadonlyMap<string, string>): string | null {
  const m = /^make\s+(?<target>\S+)$/.exec(command.trim());
  const target = m?.groups?.target;
  if (target === undefined) return null;
  for (const [path, text] of sources) {
    if (basename(path) !== 'Makefile') continue;
    const targets = extractMakeTargets(text);
    if (targets?.has(target)) return path;
  }
  return null;
}

function isComposeFileName(path: string): boolean {
  const name = basename(path);
  return /^(docker-compose.*\.ya?ml|compose\.ya?ml)$/.test(name);
}

/** Tolerant extraction of a compose file's top-level service names under `services:`. */
function extractComposeServices(text: string): ReadonlySet<string> | null {
  const idx = text.indexOf('services:');
  if (idx < 0) return null;
  const services = new Set<string>();
  for (const line of text.slice(idx + 'services:'.length).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const indent = (/^ */.exec(line)?.[0] ?? '').length;
    if (indent === 0) break; // dedented back to a sibling top-level key
    if (indent === 2) {
      const m = /^ {2}(?<name>[A-Za-z0-9_.-]+):/.exec(line);
      if (m?.groups?.name !== undefined) services.add(m.groups.name);
    }
  }
  return services;
}

/** Rule 5: `docker compose …` / `docker-compose …`, every named service exists in a compose file. */
function groundDockerCompose(command: string, sources: ReadonlyMap<string, string>): string | null {
  const m = /^(?:docker compose|docker-compose)\s+\S+(?<rest>.*)$/.exec(command.trim());
  const restRaw = m?.groups?.rest;
  if (restRaw === undefined) return null;
  const rest = restRaw.trim();
  const serviceNames = rest.length ? rest.split(/\s+/).filter((t) => !t.startsWith('-')) : [];
  for (const [path, text] of sources) {
    if (!isComposeFileName(path)) continue;
    const services = extractComposeServices(text);
    if (services && serviceNames.every((s) => services.has(s))) return path;
  }
  return null;
}

const ENV_EXAMPLE_RE = /(^|\/)\.env\.(example|sample|template)$/;

/** Rule 6: `cp <a> <b>`, where `a` is a tracked `.env.example` / `.env.sample` / `.env.template`. */
function groundEnvCopy(command: string, sources: ReadonlyMap<string, string>): string | null {
  const m = /^cp\s+(?<a>\S+)\s+\S+$/.exec(command.trim());
  const a = m?.groups?.a;
  if (a === undefined) return null;
  return ENV_EXAMPLE_RE.test(a) && sources.has(a) ? a : null;
}

/** Rule 7: `python manage.py <c>`, while `manage.py` is tracked. */
function groundManagePy(command: string, sources: ReadonlyMap<string, string>): string | null {
  if (!/^python\s+manage\.py\s+\S+/.test(command.trim())) return null;
  for (const path of sources.keys()) if (basename(path) === 'manage.py') return path;
  return null;
}

/**
 * Rule 8: `pip install -r <f>` with `f` a tracked requirements file, or
 * `pip install -e .` / `poetry install` / `uv sync` while `pyproject.toml`
 * is tracked.
 */
function groundPythonInstall(command: string, sources: ReadonlyMap<string, string>): string | null {
  const trimmed = command.trim();

  const req = /^pip install -r (?<file>\S+)$/.exec(trimmed);
  const f = req?.groups?.file;
  if (f !== undefined) {
    return /(^|\/)requirements[^/]*\.txt$/.test(f) && sources.has(f) ? f : null;
  }

  if (trimmed === 'pip install -e .' || trimmed === 'poetry install' || trimmed === 'uv sync') {
    for (const path of sources.keys()) if (basename(path) === 'pyproject.toml') return path;
  }
  return null;
}

/**
 * Grounds `command` against `sources` (command source path → text), per
 * "Grounded command" rules 1-8 in order. Returns the grounding source path,
 * or `null` when no rule matches.
 */
export function groundCommand(command: string, sources: ReadonlyMap<string, string>): string | null {
  return (
    groundVerbatim(command, sources) ??
    groundPmInstall(command, sources) ??
    groundPmScript(command, sources) ??
    groundMake(command, sources) ??
    groundDockerCompose(command, sources) ??
    groundEnvCopy(command, sources) ??
    groundManagePy(command, sources) ??
    groundPythonInstall(command, sources)
  );
}
