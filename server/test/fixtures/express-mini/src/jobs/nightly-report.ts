import cron from 'node-cron';
import { formatMoney, roundCents } from '../lib/money';

export function runNightlyReport() {
  return `${formatMoney(roundCents(1.234))} processed`;
}

export function startNightlyReport() {
  cron.schedule('0 2 * * *', runNightlyReport);
}
