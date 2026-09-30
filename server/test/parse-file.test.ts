import { describe, it, expect } from 'vitest';
import { parseSourceFile } from '../src/modules/repo-intel/pipeline/parse-file.js';

// Verbatim shape of humen-dev/blast-radius-demo src/routes/invoices.ts.
const INVOICES_TS = `import { Router } from 'express';
import { formatMoney, roundCents } from '../lib/money';

const router = Router();

export function createInvoice(req, res) {
  res.json({ total: formatMoney(req.body.amount) });
}

export function previewTax(req, res) {
  res.json({ tax: roundCents(req.body.amount * 0.2) });
}

router.post('/api/invoices', createInvoice);
router.get('/api/invoices/tax', previewTax);

export default router;
`;

const NIGHTLY_TS = `import cron from 'node-cron';
export function runNightlyReport() {}
export function startNightlyReport() {
  cron.schedule('0 2 * * *', runNightlyReport);
}
`;

describe('parseSourceFile handler maps', () => {
  it('maps each route of the demo invoices.ts to its handler', () => {
    const parsed = parseSourceFile('src/routes/invoices.ts', INVOICES_TS);
    expect(parsed.endpoints).toEqual(['GET /api/invoices/tax', 'POST /api/invoices']);
    expect(parsed.endpointHandlers).toEqual({
      'POST /api/invoices': ['createInvoice'],
      'GET /api/invoices/tax': ['previewTax'],
    });
    expect(parsed.cronHandlers).toEqual({});
  });

  it('maps a cron registration to its handler', () => {
    const parsed = parseSourceFile('src/jobs/nightly-report.ts', NIGHTLY_TS);
    expect(parsed.crons).toEqual(['0 2 * * *']);
    expect(parsed.cronHandlers).toEqual({ '0 2 * * *': ['runNightlyReport'] });
  });

  it('returns empty handler maps for python files', () => {
    const parsed = parseSourceFile('app/views.py', 'def index(request):\n    return 1\n');
    expect(parsed.endpointHandlers).toEqual({});
    expect(parsed.cronHandlers).toEqual({});
  });
});
