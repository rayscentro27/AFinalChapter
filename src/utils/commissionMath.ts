export function bpsToCents(baseAmountCents: number, rateBps: number, capCents: number | null = null): number {
  const base = Math.max(0, Math.trunc(Number(baseAmountCents) || 0));
  const bps = Math.max(0, Math.trunc(Number(rateBps) || 0));
  let computed = Math.floor((base * bps) / 10000);

  if (typeof capCents === 'number' && Number.isFinite(capCents)) {
    computed = Math.min(computed, Math.max(0, Math.trunc(capCents)));
  }

  return Math.max(0, computed);
}

export function toUsdFromCents(cents: number | null | undefined): string {
  const value = Number(cents || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value / 100);
}
