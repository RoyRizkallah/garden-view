// Each home's 2026 maintenance charge, from management's "1st & 2nd Installment 2026" sheet: the
// home's share (per thousand), the year's total and its two half-year installments, by apartment
// (no names) in prisma/data/installments-2026.json (or a sealed .seed copy when the server has
// RESIDENTS_SEED_KEY). A resident is only ever given the row for their own home.
import { loadDataJson } from './sealed';

export type Installment = { label: string; from: string; to: string; amount: number };
export type HomeCharges = {
  year: number;
  sharePerThousand: number;
  total: number;
  installments: Installment[];
};

type Row = { block: string; number: string; sharePerThousand: number; total: number; first: number; second: number };

const YEAR = 2026;
const normal = (value: string) => value.replace(/\s+/g, ' ').trim().toUpperCase();

/** One home's charges for the year, or null when the sheet has no row for it (or cannot be opened). */
export function chargesFor(block: string, number: string): HomeCharges | null {
  const rows = loadDataJson<Row[]>(`installments-${YEAR}`, 'INSTALLMENTS_JSON_FILE');
  const row = rows?.find((item) => normal(item.block) === normal(block) && normal(item.number) === normal(number));
  if (!row) return null;
  return {
    year: YEAR,
    sharePerThousand: row.sharePerThousand,
    total: row.total,
    installments: [
      { label: '1st installment', from: `${YEAR}-01-01`, to: `${YEAR}-06-30`, amount: row.first },
      { label: '2nd installment', from: `${YEAR}-06-30`, to: `${YEAR}-12-31`, amount: row.second },
    ],
  };
}
