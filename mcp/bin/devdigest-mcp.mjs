#!/usr/bin/env node
// stdout carries only MCP JSON-RPC: redirect stray console output to stderr
// before any module (ours or a dependency) is loaded.
console.log = console.error;
console.info = console.error;
// Dynamic imports on purpose: static ones would be evaluated before the redirect.
import('tsx/esm/api')
  .then(({ register }) => {
    register();
    return import('../src/index.ts');
  })
  .catch((err) => {
    process.stderr.write(`[devdigest-mcp] failed to start: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
