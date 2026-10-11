/**
 * Deterministic tier for dependency-checker — no model, ~1 s. The skill's numbers come from
 * scripts/collect.mjs and scripts/report.mjs, so their contract is tested directly: a tiny
 * synthetic repo with known sizes, usages and traps goes in, the snapshot and report come out.
 *
 *   api/     pnpm · used-lib (→ nested leaf), unused-lib, helper-lib (dev, imported from src), zod 3
 *   engine/  npm  · zod 4 (major drift of a shared-contract lib), pnpm leftovers in node_modules,
 *                   tsconfig alias into api/ (internal edge)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SKILLS_DIR } from "../../src/index.js";

const SCRIPTS = join(SKILLS_DIR, "dependency-checker", "scripts");
const root = mkdtempSync(join(tmpdir(), "depcheck-"));

function put(rel: string, content: string | object): void {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

/** An installed package: package.json + one payload file of `bytes` bytes. */
function installed(dir: string, name: string, version: string, bytes: number, deps: Record<string, string> = {}): void {
  put(`${dir}/package.json`, { name, version, license: "MIT", dependencies: deps });
  put(`${dir}/index.js`, "x".repeat(bytes));
}

function collect(out: string, extra: string[] = []): any {
  execFileSync(process.execPath, [join(SCRIPTS, "collect.mjs"), "--root", root, "--out", out, ...extra], { encoding: "utf8" });
  return JSON.parse(readFileSync(join(root, out), "utf8"));
}

function render(snapshot: string, out: string): string {
  execFileSync(process.execPath, [join(SCRIPTS, "report.mjs"), join(root, snapshot), "--out", out], { encoding: "utf8" });
  return readFileSync(join(root, out), "utf8");
}

let snap: any;
const pkg = (dir: string) => snap.packages.find((p: any) => p.dir === dir);
const dep = (dir: string, name: string) => pkg(dir).deps.find((d: any) => d.name === name);
const finding = (rule: string, depName?: string) =>
  snap.findings.find((f: any) => f.rule === rule && (depName === undefined || f.dep === depName));

beforeAll(() => {
  // api — pnpm
  put("api/package.json", {
    name: "api",
    dependencies: { "used-lib": "^1.0.0", "unused-lib": "^1.0.0", zod: "^3.24.0" },
    devDependencies: { "helper-lib": "^1.0.0" },
  });
  put("api/pnpm-lock.yaml", "lockfileVersion: '9.0'\n\npackages:\n\n  used-lib@1.0.0:\n    resolution: {}\n\n  leaf@1.0.0:\n    resolution: {}\n");
  put("api/src/index.ts", "import { a } from 'used-lib';\nimport { z } from 'zod';\nimport { h } from 'helper-lib';\n");
  put("api/src/shared/index.ts", "export const shared = 1;\n");
  installed("api/node_modules/used-lib", "used-lib", "1.0.0", 1000, { leaf: "^1.0.0" });
  installed("api/node_modules/used-lib/node_modules/leaf", "leaf", "1.0.0", 2000);
  installed("api/node_modules/unused-lib", "unused-lib", "1.0.0", 500);
  installed("api/node_modules/helper-lib", "helper-lib", "1.0.0", 300);
  installed("api/node_modules/zod", "zod", "3.25.0", 4000);

  // engine — npm, with pnpm leftovers and an alias into api
  put("engine/package.json", { name: "engine", dependencies: { zod: "^4.0.0" } });
  put("engine/package-lock.json", { lockfileVersion: 3, packages: { "": {}, "node_modules/zod": { version: "4.0.0" } } });
  put("engine/tsconfig.json", { compilerOptions: { paths: { "@x/shared": ["../api/src/shared/index.ts"] } } });
  put("engine/src/index.ts", "import { z } from 'zod';\nimport { shared } from '@x/shared';\n");
  installed("engine/node_modules/zod", "zod", "4.0.0", 4000);
  put("engine/node_modules/.pnpm/junk/blob.bin", "y".repeat(5000));

  snap = collect("docs/dependencies/snapshots/2026-01-01.json", ["--no-baseline"]);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("skill:dependency-checker scripts", () => {
  test("discovers both packages with their own manager", () => {
    expect(snap.packages.map((p: any) => p.dir).sort()).toEqual(["api", "engine"]);
    expect(pkg("api").manager).toBe("pnpm");
    expect(pkg("engine").manager).toBe("npm");
    expect(pkg("api").lockPackages).toBe(2);
  });

  test("measures own, closure and exclusive size through nested node_modules", () => {
    const d = dep("api", "used-lib");
    expect(d.closurePackages).toBe(2); // used-lib + nested leaf
    expect(d.closureBytes).toBeGreaterThan(d.selfBytes + 2000 - 1);
    expect(d.selfBytes).toBeLessThan(2000); // nested node_modules excluded from own size
    expect(d.exclusiveBytes).toBe(d.closureBytes); // nothing else shares leaf
    expect(d.installedVersion).toBe("1.0.0");
  });

  test("classifies usage and flags unused and misplaced dependencies", () => {
    expect(dep("api", "used-lib").usage.prodFiles).toBe(1);
    expect(finding("possibly-unused", "unused-lib")).toMatchObject({ priority: "P1", package: "api" });
    expect(finding("dev-used-in-prod", "helper-lib")).toMatchObject({ priority: "P1", package: "api" });
    expect(finding("possibly-unused", "used-lib")).toBeUndefined();
  });

  test("flags major drift of a shared-contract library across packages", () => {
    const drift = snap.crossPackage.find((c: any) => c.name === "zod");
    expect(drift.drift).toBe("major");
    expect(finding("version-drift", "zod")).toMatchObject({ priority: "P1" });
  });

  test("detects another manager's leftovers in node_modules", () => {
    expect(pkg("engine").strayDirs).toEqual([".pnpm"]);
    expect(pkg("engine").unreachableBytes).toBeGreaterThanOrEqual(5000);
    expect(finding("stray-install")).toMatchObject({ priority: "P2", package: "engine" });
  });

  test("builds the internal graph from tsconfig path aliases", () => {
    expect(snap.internalEdges).toContainEqual(expect.objectContaining({ from: "engine", to: "api", kind: "source-alias" }));
  });

  test("numbers findings in priority order", () => {
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>;
    const ranks = snap.findings.map((f: any) => order[f.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    snap.findings.forEach((f: any, i: number) => expect(f.id).toBe(`F${String(i + 1).padStart(2, "0")}`));
  });

  test("renders every fixed section, two diagrams and the agent markers", () => {
    const md = render("docs/dependencies/snapshots/2026-01-01.json", "docs/dependencies/2026-01-01.md");
    for (const h of [
      "## 1. Summary", "## 2. Component map", "## 3. Weight map", "## 4. Size overview",
      "## 5. Dependencies by type", "## 6. Per-package dependencies", "## 7. Shared across packages",
      "## 8. Duplicate versions", "## 9. Security & freshness", "## 10. Findings",
      "## 11. Prioritized action plan", "## 12. Recommendations", "## Method & caveats",
    ]) expect(md).toContain(h);
    expect(md.match(/```mermaid/g)).toHaveLength(2);
    expect(md).toContain('engine == "@x/shared (source)" ==> api');
    // §1, §10, §11, §12 always; §5 too, because the synthetic libs are unclassified ("other")
    expect(md.match(/<!-- AGENT:/g)).toHaveLength(5);
    expect(md).toContain("Not run — rerun the collector with `--audit --outdated`");
    expect(md).not.toContain("## 13.");
  });

  test("diffs against a baseline snapshot and renders §13", () => {
    put("api/package.json", {
      name: "api",
      dependencies: { "used-lib": "^1.0.0", zod: "^3.24.0" },
      devDependencies: { "helper-lib": "^1.0.0" },
    });
    const next = collect("docs/dependencies/snapshots/2026-02-01.json"); // auto-picks the older snapshot
    const api = next.delta.packages.find((p: any) => p.dir === "api");
    expect(api.removed).toEqual(["prod:unused-lib"]);
    expect(render("docs/dependencies/snapshots/2026-02-01.json", "docs/dependencies/2026-02-01.md")).toContain("## 13. Change since baseline");
  });
});
