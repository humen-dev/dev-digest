import { describe, it, expect } from 'vitest';
import { intentLogLine, type IntentLogInput } from '../src/modules/reviews/helpers.js';

type LogRecord = NonNullable<IntentLogInput['record']>;

const record = (over: Partial<LogRecord> = {}): LogRecord => ({
  confidence: 'high',
  sources: [
    { kind: 'pr_title', ref: 'title', title: null, status: 'resolved', reason: null, chars: 20, truncated: false },
    { kind: 'github_issue', ref: '#7', title: null, status: 'unresolved', reason: 'not_found', chars: 0, truncated: false },
  ],
  provider: 'openai',
  model: 'gpt-4.1-mini',
  tokens_in: 1234,
  tokens_out: 210,
  api_cost_usd: 0.00213,
  ...over,
});

describe('intentLogLine', () => {
  it('shows confidence, sources, model, tokens and cost for a fresh classification', () => {
    const line = intentLogLine({ status: 'classified', reason: null, record: record() });
    expect(line).toBe(
      'PR intent classified (high confidence, 1 resolved / 1 unresolved source(s)) · ' +
        'openai/gpt-4.1-mini, 1234 in / 210 out tokens, $0.0021',
    );
  });

  it('marks a reused intent as costing no model call this run', () => {
    const line = intentLogLine({ status: 'reused', reason: null, record: record() });
    expect(line).toContain('openai/gpt-4.1-mini, 1234 in / 210 out tokens');
    expect(line).toMatch(/reused, no model call this run$/);
  });

  it('degrades to explicit placeholders for legacy rows without model or usage', () => {
    const line = intentLogLine({
      status: 'reused',
      reason: null,
      record: record({ provider: null, model: null, tokens_in: null, tokens_out: null, api_cost_usd: null }),
    });
    expect(line).toContain('unknown model, tokens n/a');
    expect(line).not.toContain('$');
  });

  it('reports the failure reason when intent is unavailable', () => {
    expect(intentLogLine({ status: 'unavailable', reason: 'model_not_configured', record: null })).toBe(
      'PR intent unavailable (model_not_configured) — reviewing without it',
    );
  });
});
