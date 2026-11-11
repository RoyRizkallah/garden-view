// The building's budget, as approved in "Budget 2026 & Leasehold Improvements" (the PDF residents
// can open from Documents). It is the same for every home; each home's own charge is on its
// Charges page. The figures are in prisma/data/budget-2026.json (or a sealed .seed copy when the
// server has RESIDENTS_SEED_KEY). It names staff salaries, so it is served only to signed-in
// residents. Amounts are in US dollars as on the sheet; totals are computed from the lines and
// checked against the totals the sheet prints.
import { loadDataJson } from './sealed';

export type BudgetItem = { label: string; amount: number; note?: string };
export type BudgetPost = { no: number; title: string; kind: 'Variable' | 'Fixed' | 'Other'; items: BudgetItem[] };
export type Improvement = { label: string; byYear: Record<string, number> };

type BudgetSheet = {
  year: number;
  posts: BudgetPost[];
  improvements: Improvement[];
  /** the totals printed on the sheet: operating (posts without "Other"), total, and works by year */
  printedTotals: { operating: number; total: number; improvements: Record<string, number> };
};

const YEAR = 2026;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** The budget as residents see it, every total computed from the lines; null when it cannot be opened. */
export function budgetSummary() {
  const sheet = loadDataJson<BudgetSheet>(`budget-${YEAR}`, 'BUDGET_JSON_FILE');
  if (!sheet) return null;
  const posts = sheet.posts.map((post) => ({ ...post, total: sum(post.items.map((entry) => entry.amount)) }));
  const total = sum(posts.map((post) => post.total));
  const byKind = (kind: BudgetPost['kind']) => sum(posts.filter((post) => post.kind === kind).map((post) => post.total));
  const years = [...new Set(sheet.improvements.flatMap((entry) => Object.keys(entry.byYear)))].sort();
  const worksByYear = Object.fromEntries(years.map((year) => [year, sum(sheet.improvements.map((entry) => entry.byYear[year] ?? 0))]));

  // a line typed wrong shows up here, not as a wrong total in front of residents
  const printed = sheet.printedTotals;
  const mismatches = [
    total - byKind('Other') !== printed.operating && 'operating',
    total !== printed.total && 'total',
    ...years.filter((year) => printed.improvements[year] !== undefined && worksByYear[year] !== printed.improvements[year]),
  ].filter(Boolean);
  if (mismatches.length) console.warn('[budget] computed totals differ from the sheet:', mismatches.join(', '));

  return {
    year: sheet.year,
    total,
    variable: byKind('Variable'),
    fixed: byKind('Fixed'),
    other: byKind('Other'),
    posts,
    improvements: { years, totals: worksByYear, items: sheet.improvements },
  };
}
