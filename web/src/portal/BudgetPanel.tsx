import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from './api';
import { IconArrowRight, IconChevronRight, IconPieChart } from '../components/Icons';

/** `amount` as approved, `current` this year (with the year's changes) */
type BudgetItem = { label: string; amount: number; current: number; change: number; changeNote?: string; note?: string };
type BudgetPost = {
  no: number;
  title: string;
  kind: 'Variable' | 'Fixed' | 'Other';
  items: BudgetItem[];
  initial: number;
  current: number;
};
type Budget = {
  year: number;
  initial: number;
  current: number;
  variable: number;
  fixed: number;
  other: number;
  changes: { change: number; note: string }[];
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
  const posts = [...budget.posts].sort((a, b) => b.current - a.current);
  const largest = posts[0]?.current ?? 1;
  const increase = budget.current - budget.initial;
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${dollars.format(Math.abs(value))}`;

  return (
    <section className="rs-card bg-panel" aria-labelledby="budget-title">
      <header className="bg-head">
        <div>
          <p className="bg-kicker">
            <IconPieChart size={14} /> Budget {budget.year} · the same for every home
          </p>
          <h2 id="budget-title">Where the service charges go</h2>
          <p className="bg-lede">
            The building’s running budget: as first approved, and for this year. Your home’s share of it is on your{' '}
            <Link to="/portal/charges">Charges</Link> page.
          </p>
        </div>
        <div className="bg-totals">
          <div className="bg-total is-initial">
            <span>Initial budget</span>
            <strong>{dollars.format(budget.initial)}</strong>
            <span className="bg-split">As approved</span>
          </div>
          <div className="bg-total">
            <span>This year</span>
            <strong>{dollars.format(budget.current)}</strong>
            <span className="bg-split">
              {increase !== 0
                ? budget.changes.map((change) => `${signed(change.change)} · ${change.note}`).join(' · ')
                : 'No change'}
            </span>
          </div>
        </div>
      </header>

      <div className="bg-columns" aria-hidden="true">
        <span />
        <span />
        <span className="bg-amount">Initial</span>
        <span className="bg-amount">This year</span>
        <span className="bg-share">Share</span>
        <span />
      </div>
      <ol className="bg-posts">
        {posts.map((post) => (
          <li key={post.no}>
            <details className={`bg-post${post.current !== post.initial ? ' is-changed' : ''}`}>
              <summary
                title={`${post.title}: initial ${dollars.format(post.initial)}, this year ${dollars.format(post.current)}, ${percent(post.current, budget.current)} of this year’s budget`}
              >
                <span className="bg-post-name">
                  {post.title}
                  <em>{post.kind}</em>
                </span>
                <span className="bg-bar" aria-hidden="true">
                  <span
                    style={
                      {
                        width: `${(post.current / largest) * 100}%`,
                        '--initial-share': `${(Math.min(post.initial, post.current) / post.current) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </span>
                <span className="bg-amount is-initial">{dollars.format(post.initial)}</span>
                <span className="bg-amount">
                  {dollars.format(post.current)}
                  {post.current !== post.initial && <em className="bg-change">{signed(post.current - post.initial)}</em>}
                </span>
                <span className="bg-share">{percent(post.current, budget.current)}</span>
                <IconChevronRight size={14} className="bg-chevron" />
              </summary>
              <ul className="bg-items">
                {post.items.map((entry) => (
                  <li key={entry.label}>
                    <span>
                      {entry.label}
                      {entry.note && <em>{entry.note}</em>}
                      {entry.changeNote && <em className="bg-change-note">{entry.changeNote}</em>}
                    </span>
                    <span className="bg-amount is-initial">{dollars.format(entry.amount)}</span>
                    <span className="bg-amount">{dollars.format(entry.current)}</span>
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
