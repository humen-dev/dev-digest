import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '../src/platform/resilience.js';

const noDelay = { baseDelayMs: 0, maxDelayMs: 0 };

function failing(errors: unknown[]) {
  let calls = 0;
  const fn = async (): Promise<string> => {
    const err = errors[calls];
    calls += 1;
    if (err) throw err;
    return 'ok';
  };
  return { fn, calls: () => calls };
}

describe('withRetry', () => {
  it('retries 429 / 5xx', async () => {
    const f = failing([{ status: 429 }, { status: 503 }]);
    await expect(withRetry(f.fn, noDelay)).resolves.toBe('ok');
    expect(f.calls()).toBe(3);
  });

  it('retries the real SDK connection errors (clients run with maxRetries: 0)', async () => {
    const f = failing([
      new OpenAI.APIConnectionError({ message: 'reset' }),
      new OpenAI.APIConnectionTimeoutError({ message: 'timeout' }),
      new Anthropic.APIConnectionError({ message: 'reset' }),
    ]);
    await expect(withRetry(f.fn, noDelay)).resolves.toBe('ok');
    expect(f.calls()).toBe(4);
  });

  it('does not retry a 4xx client error', async () => {
    const f = failing([{ status: 400 }]);
    await expect(withRetry(f.fn, noDelay)).rejects.toEqual({ status: 400 });
    expect(f.calls()).toBe(1);
  });

  it('gives up after `retries` extra attempts', async () => {
    const f = failing([{ status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(withRetry(f.fn, { ...noDelay, retries: 2 })).rejects.toEqual({ status: 500 });
    expect(f.calls()).toBe(3);
  });
});
