import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

const ROOT = fileURLToPath(new URL('./fixtures/depgraph-mini', import.meta.url));

describe('DepCruiseGraph', () => {
  it('returns repo-relative POSIX edges that match the indexer file list (also on Windows)', async () => {
    const edges = await new DepCruiseGraph().buildEdges(ROOT, ['src/lib/money.ts', 'src/routes/orders.ts']);
    expect(edges).toEqual([{ from: 'src/routes/orders.ts', to: 'src/lib/money.ts' }]);
  });
});
