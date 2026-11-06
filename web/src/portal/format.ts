export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "5 Nov 2026" */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "5 Nov" */
export const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "November 2026" from the ledger's "2026-11" period. */
export const monthYear = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return year && month
    ? new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : period;
};

/** "Nov" from "2026-11" — compact chart labels. */
export const periodShort = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return year && month
    ? new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
    : period;
};

/** "Closes today", "Closes tomorrow", "Closes in 5 days", "Closed". */
export const closesIn = (iso: string) => {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return `Closes in ${days} days`;
};
