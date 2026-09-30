export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
