// Each home's charges for the year, from management's sheets, by apartment (no names):
//  - "1st & 2nd Installment 2026" (prisma/data/installments-2026.json): the home's share (per
//    thousand), the year's maintenance and its two half-year installments;
//  - "Fuel Additional Budget, common areas" (prisma/data/fuel-additional-2026.json): the home's
//    part of the extra fuel for the year.
// Either may be a sealed .seed copy when the server has RESIDENTS_SEED_KEY. A resident is only ever
// given the rows for their own home.
import { loadDataJson } from './sealed';

export type Installment = { label: string; from: string; to: string; amount: number };
/** a charge on top of the maintenance, such as the additional fuel */
export type ExtraCharge = { label: string; note: string; amount: number };
export type HomeCharges = {
  year: number;
  sharePerThousand: number;
  /** the year's maintenance, paid in the two installments */
  maintenance: number;
  installments: Installment[];
  extras: ExtraCharge[];
  /** everything for the year: maintenance and extras */
  total: number;
};

type Row = { block: string; number: string; sharePerThousand: number; total: number; first: number; second: number };
type FuelRow = { block: string; number: string; sharePerThousand: number; amount: number };

const YEAR = 2026;
const normal = (value: string) => value.replace(/\s+/g, ' ').trim().toUpperCase();
const isHome = (block: string, number: string) => (item: { block: string; number: string }) =>
  normal(item.block) === normal(block) && normal(item.number) === normal(number);
const fuelRows = () => loadDataJson<FuelRow[]>(`fuel-additional-${YEAR}`, 'FUEL_JSON_FILE');

/** what the homes are charged in all for the additional fuel this year; null without the sheet */
export function fuelAdditionalTotal(): number | null {
  const rows = fuelRows();
  return rows ? rows.reduce((sum, row) => sum + row.amount, 0) : null;
}

/** One home's charges for the year, or null when the maintenance sheet has no row for it (or cannot be opened). */
export function chargesFor(block: string, number: string): HomeCharges | null {
  const row = loadDataJson<Row[]>(`installments-${YEAR}`, 'INSTALLMENTS_JSON_FILE')?.find(isHome(block, number));
  if (!row) return null;
  const fuel = fuelRows()?.find(isHome(block, number));
  const extras: ExtraCharge[] = fuel
    ? [{ label: 'Additional fuel', note: 'Common areas, your share of the extra fuel this year', amount: fuel.amount }]
    : [];
  return {
    year: YEAR,
    sharePerThousand: row.sharePerThousand,
    maintenance: row.total,
    installments: [
      { label: '1st installment', from: `${YEAR}-01-01`, to: `${YEAR}-06-30`, amount: row.first },
      { label: '2nd installment', from: `${YEAR}-06-30`, to: `${YEAR}-12-31`, amount: row.second },
    ],
    extras,
    total: row.total + extras.reduce((sum, extra) => sum + extra.amount, 0),
  };
}
