import { z } from 'zod';
import { MAX_PERIOD_MS } from './constants.js';
import { parseInstant } from './domain/period.js';

/** Module-local querystring for `GET /agents/performance` and `GET /agents/:id/stats`. Private. */
export const PerfQuery = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .superRefine((q, ctx) => {
    if (q.from === undefined && q.to === undefined) return;
    if (q.from === undefined) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: '`from` is required when `to` is given' });
      return;
    }
    if (q.to === undefined) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: '`to` is required when `from` is given' });
      return;
    }
    const from = parseInstant(q.from);
    const to = parseInstant(q.to);
    if (!from) ctx.addIssue({ code: 'custom', path: ['from'], message: '`from` is not a valid ISO-8601 instant' });
    if (!to) ctx.addIssue({ code: 'custom', path: ['to'], message: '`to` is not a valid ISO-8601 instant' });
    if (!from || !to) return;
    if (from.getTime() > to.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: '`from` must not be later than `to`' });
    } else if (to.getTime() - from.getTime() > MAX_PERIOD_MS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'The period must not exceed 366 days' });
    }
  });
export type PerfQuery = z.infer<typeof PerfQuery>;
