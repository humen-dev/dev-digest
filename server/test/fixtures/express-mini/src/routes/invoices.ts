import { Router } from 'express';
import { formatMoney, roundCents } from '../lib/money';

export const router = Router();

export function createInvoice(req: any, res: any) {
  res.json({ total: formatMoney(req.body.total) });
}

export function previewTax(req: any, res: any) {
  res.json({ tax: roundCents(req.query.amount * 0.2) });
}

router.post('/api/invoices', createInvoice);
router.get('/api/invoices/tax', previewTax);
