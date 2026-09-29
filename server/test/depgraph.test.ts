import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

vi.mock('dependency-cruiser', async (orig) => {
  const m = await orig<typeof import('dependency-cruiser')>();
  return { ...m, cruise: vi.fn(m.cruise) };
});

const ROOT = fileURLToPath(new URL('./fixtures/depgraph-mini', import.meta.url));

describe('DepCruiseGraph', () => {
  it('returns repo-relative POSIX edges that match the indexer file list (also on Windows)', async () => {
    const edges = await new DepCruiseGraph().buildEdges(ROOT, ['src/lib/money.ts', 'src/routes/orders.ts']);
    expect(edges).toEqual([{ from: 'src/routes/orders.ts', to: 'src/lib/money.ts' }]);
  });

  it('drops non-JS/TS paths before cruising', async () => {
    vi.mocked(cruise).mockClear();
    const edges = await new DepCruiseGraph().buildEdges(ROOT, [
      'py/util.py',
      'src/lib/money.ts',
      'src/routes/orders.ts',
    ]);
    expect(edges).toEqual([{ from: 'src/routes/orders.ts', to: 'src/lib/money.ts' }]);
    const passed = vi.mocked(cruise).mock.calls.flatMap((c) => c[0] as string[]);
    expect(passed.length).toBe(2);
    expect(passed.some((p) => p.endsWith('.py'))).toBe(false);
  });

  it('returns [] without cruising when only Python files are given', async () => {
    vi.mocked(cruise).mockClear();
    expect(await new DepCruiseGraph().buildEdges(ROOT, ['py/util.py'])).toEqual([]);
    expect(cruise).not.toHaveBeenCalled();
  });
});
