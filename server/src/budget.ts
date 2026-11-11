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

/**
 * Changes decided for this year on top of the approved sheet. The sheet itself stays as approved
 * (it is the PDF residents can open); residents see the initial figure beside this year's.
 * Each change names its post (by number) and its line (by label), as on the sheet.
 */
const REVISIONS: { post: number; item: string; change: number; note: string }[] = [
  { post: 3, item: 'Generator and boiler: common areas', change: 100000, note: 'Fuel increase this year' },
];

/** The budget as residents see it, every total computed from the lines; null when it cannot be opened. */
export function budgetSummary() {
  const sheet = loadDataJson<BudgetSheet>(`budget-${YEAR}`, 'BUDGET_JSON_FILE');
  if (!sheet) return null;

  // each line's initial amount (as approved) and this year's (with the year's changes)
  const posts = sheet.posts.map((post) => {
    const items = post.items.map((entry) => {
      const changes = REVISIONS.filter((revision) => revision.post === post.no && revision.item === entry.label);
      const change = sum(changes.map((revision) => revision.change));
      return { ...entry, current: entry.amount + change, change, changeNote: changes.map((revision) => revision.note).join('; ') || undefined };
    });
    return { ...post, items, initial: sum(items.map((entry) => entry.amount)), current: sum(items.map((entry) => entry.current)) };
  });
  const applied = posts.flatMap((post) => post.items).filter((entry) => entry.change !== 0).length;
  if (applied !== REVISIONS.length) console.warn('[budget] a revision names a post or line that is not on the sheet.');

  const total = sum(posts.map((post) => post.initial));
  const current = sum(posts.map((post) => post.current));
  const byKind = (kind: BudgetPost['kind'], pick: 'initial' | 'current') =>
    sum(posts.filter((post) => post.kind === kind).map((post) => post[pick]));
  const years = [...new Set(sheet.improvements.flatMap((entry) => Object.keys(entry.byYear)))].sort();
  const worksByYear = Object.fromEntries(years.map((year) => [year, sum(sheet.improvements.map((entry) => entry.byYear[year] ?? 0))]));

  // a line typed wrong shows up here, not as a wrong total in front of residents
  const printed = sheet.printedTotals;
  const mismatches = [
    total - byKind('Other', 'initial') !== printed.operating && 'operating',
    total !== printed.total && 'total',
    ...years.filter((year) => printed.improvements[year] !== undefined && worksByYear[year] !== printed.improvements[year]),
  ].filter(Boolean);
  if (mismatches.length) console.warn('[budget] computed totals differ from the sheet:', mismatches.join(', '));

  return {
    year: sheet.year,
    /** as approved */
    initial: total,
    /** this year, with the year's changes */
    current,
    variable: byKind('Variable', 'current'),
    fixed: byKind('Fixed', 'current'),
    other: byKind('Other', 'current'),
    changes: REVISIONS.map(({ change, note }) => ({ change, note })),
    posts,
    improvements: { years, totals: worksByYear, items: sheet.improvements },
  };
}
