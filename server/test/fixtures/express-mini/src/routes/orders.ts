import { Router } from 'express';
import { formatMoney } from '../lib/money';

export const router = Router();

export function listOrders(req: any, res: any) {
  const orders = [1, 2, 3].map((n) => ({ id: n, total: formatMoney(n * 10) }));
  res.json(orders);
}

export function getOrder(req: any, res: any) {
  res.json({ id: req.params.id, total: formatMoney(10) });
}

router.get('/api/orders', listOrders);
router.get('/api/orders/:id', getOrder);
