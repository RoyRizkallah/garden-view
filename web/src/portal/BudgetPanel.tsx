import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from './api';
import { IconArrowRight, IconChevronRight, IconPieChart } from '../components/Icons';

type BudgetItem = { label: string; amount: number; note?: string };
type BudgetPost = { no: number; title: string; kind: 'Variable' | 'Fixed' | 'Other'; items: BudgetItem[]; total: number };
type Budget = {
  year: number;
  total: number;
  variable: number;
  fixed: number;
  other: number;
  posts: BudgetPost[];
  improvements: { years: string[]; totals: Record<string, number>; items: { label: string; byYear: Record<string, number> }[] };
};

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = (part: number, whole: number) => {
  const value = (part / whole) * 100;
  return `${value < 1 ? value.toFixed(1) : Math.round(value)}%`;
};

/**
 * The building's budget, the same for every home: where the service charges go, post by post,
 * largest first, each opening onto its lines; then the works planned on the building. A resident's
 * own share is on the Charges page.
 */
export default function BudgetPanel() {
  const [data, setData] = useState<{ budget: Budget | null; document: { title: string; fileUrl: string } | null } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<{ budget: Budget | null; document: { title: string; fileUrl: string } | null }>('/resident/budget')
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error || !data) return null;
  const { budget, document } = data;
  if (!budget) {
    return (
      <div className="rs-empty">
        <span className="rs-empty-icon">
          <IconPieChart size={20} />
        </span>
        <h2>The budget is not published yet</h2>
        <p>When building management publishes this year’s budget, it appears here.</p>
      </div>
    );
  }
  const posts = [...budget.posts].sort((a, b) => b.total - a.total);
  const largest = posts[0]?.total ?? 1;

  return (
    <section className="rs-card bg-panel" aria-labelledby="budget-title">
      <header className="bg-head">
        <div>
          <p className="bg-kicker">
            <IconPieChart size={14} /> Budget {budget.year} · the same for every home
          </p>
          <h2 id="budget-title">Where the service charges go</h2>
          <p className="bg-lede">
            The building’s running budget for the year. Your home’s share of it is on your{' '}
            <Link to="/portal/charges">Charges</Link> page.
          </p>
        </div>
        <div className="bg-total">
          <span>Total budget</span>
          <strong>{dollars.format(budget.total)}</strong>
          <span className="bg-split">
            {dollars.format(budget.variable)} variable · {dollars.format(budget.fixed)} fixed
            {budget.other > 0 && ` · ${dollars.format(budget.other)} other`}
          </span>
        </div>
      </header>

      <ol className="bg-posts">
        {posts.map((post) => (
          <li key={post.no}>
            <details className="bg-post">
              <summary title={`${post.title}: ${dollars.format(post.total)}, ${percent(post.total, budget.total)} of the budget`}>
                <span className="bg-post-name">
                  {post.title}
                  <em>{post.kind}</em>
                </span>
                <span className="bg-bar" aria-hidden="true">
                  <span style={{ width: `${(post.total / largest) * 100}%` }} />
                </span>
                <span className="bg-amount">{dollars.format(post.total)}</span>
                <span className="bg-share">{percent(post.total, budget.total)}</span>
                <IconChevronRight size={14} className="bg-chevron" />
              </summary>
              <ul className="bg-items">
                {post.items.map((entry) => (
                  <li key={entry.label}>
                    <span>
                      {entry.label}
                      {entry.note && <em>{entry.note}</em>}
                    </span>
                    <span className="bg-amount">{dollars.format(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>

      <details className="bg-works">
        <summary>
          <span className="bg-post-name">
            Leasehold improvements
            <em>Works on the building</em>
          </span>
          <span className="bg-works-years">
            {budget.improvements.years.map((year) => (
              <span key={year}>
                {year} <b>{dollars.format(budget.improvements.totals[year])}</b>
              </span>
            ))}
          </span>
          <IconChevronRight size={14} className="bg-chevron" />
        </summary>
        <div className="bg-works-table" role="table" aria-label="Leasehold improvements by year">
          <div className="bg-works-row is-head" role="row">
            <span role="columnheader">Work</span>
            {budget.improvements.years.map((year) => (
              <span key={year} role="columnheader" className="bg-amount">
                {year}
              </span>
            ))}
          </div>
          {budget.improvements.items.map((work) => (
            <div key={work.label} className="bg-works-row" role="row">
              <span role="cell">{work.label}</span>
              {budget.improvements.years.map((year) => (
                <span key={year} role="cell" className="bg-amount">
                  {work.byYear[year] ? dollars.format(work.byYear[year]) : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      </details>

      {document && (
        <a className="bg-pdf" href={mediaUrl(document.fileUrl)} target="_blank" rel="noreferrer">
          Open the budget as approved (PDF) <IconArrowRight size={14} />
        </a>
      )}
    </section>
  );
}
