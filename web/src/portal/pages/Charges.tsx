import { useEffect, useMemo, useState } from 'react';
import { api, type Charge } from '../api';
import { usd, monthYear, shortDate, periodShort } from '../format';
import PageHeader from '../PageHeader';
import VoteDonut from '../VoteDonut';
import LineChart from '../LineChart';
import { IconCalendar, IconDocument, IconWallet } from '../../components/Icons';

const PAGE_SIZE = 5;
const DATE_RANGES = ['All Time', 'This Year', 'Last 6 Months', 'Last 3 Months'] as const;
const STATUS_FILTERS = ['All Statuses', 'Due', 'Paid', 'Overdue'] as const;

function isOverdue(charge: Charge) {
  return charge.status !== 'PAID' && new Date(charge.dueDate) < new Date();
}

/** "in 39 days", "due today", "12 days late" — how far the due date is from today. */
function dueIn(dueDate: string): string {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(dueDate).setHours(0, 0, 0, 0) - start.getTime()) / day);
  if (days === 0) return 'due today';
  if (days > 0) return `in ${days} ${days === 1 ? 'day' : 'days'}`;
  return `${-days} ${days === -1 ? 'day' : 'days'} late`;
}

function statusOf(charge: Charge): { label: string; tone: string } {
  if (isOverdue(charge)) return { label: 'Overdue', tone: 'danger' };
  if (charge.status === 'PAID') return { label: 'Paid', tone: 'ok' };
  return { label: 'Due', tone: 'warn' };
}

export default function Charges() {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<(typeof DATE_RANGES)[number]>('All Time');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All Statuses');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get<{ charges: Charge[] }>('/resident/charges')
      .then((res) => setCharges(res.charges))
      .catch((err) => setError(err.message));
  }, []);

  const stats = useMemo(() => {
    const all = charges ?? [];
    const year = new Date().getFullYear();
    const inYear = (charge: Charge) => Number(charge.period.slice(0, 4)) === year;
    const overdue = all.filter(isOverdue);

    const balance = all.reduce((sum, charge) => sum + (charge.amountDue - charge.amountPaid), 0);
    const dueYTD = all.filter(inYear).reduce((sum, charge) => sum + charge.amountDue, 0);
    const paidYTD = all.filter(inYear).reduce((sum, charge) => sum + charge.amountPaid, 0);
    const overdueTotal = overdue.reduce((sum, charge) => sum + (charge.amountDue - charge.amountPaid), 0);
    const paidPct = dueYTD > 0 ? Math.round((paidYTD / dueYTD) * 100) : 100;

    return { balance, dueYTD, paidYTD, overdueTotal, overdueCount: overdue.length, paidPct };
  }, [charges]);

  const filtered = useMemo(() => {
    let list = charges ?? [];
    if (dateRange !== 'All Time') {
      const months = dateRange === 'This Year' ? null : dateRange === 'Last 6 Months' ? 6 : 3;
      const now = new Date();
      list = list.filter((charge) => {
        const [year, month] = charge.period.split('-').map(Number);
        const periodDate = new Date(year, month - 1, 1);
        if (months === null) return year === now.getFullYear();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
        return periodDate >= cutoff;
      });
    }
    if (statusFilter !== 'All Statuses') {
      list = list.filter((charge) =>
        statusFilter === 'Overdue' ? isOverdue(charge) : charge.status === statusFilter.toUpperCase(),
      );
    }
    return [...list].sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [charges, dateRange, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const firstRow = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(safePage * PAGE_SIZE, filtered.length);

  const chartData = useMemo(() => {
    const list = [...(charges ?? [])].sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
    return {
      labels: list.map((charge) => periodShort(charge.period)),
      paid: list.map((charge) => charge.amountPaid),
      due: list.map((charge) => charge.amountDue),
    };
  }, [charges]);

  const unpaidYTD = Math.max(0, stats.dueYTD - stats.paidYTD);

  // the payment that matters now: the oldest one still open
  const nextDue = useMemo(
    () =>
      [...(charges ?? [])]
        .filter((charge) => charge.status !== 'PAID' && charge.amountDue - charge.amountPaid > 0.004)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
    [charges],
  );

  return (
    <div className="rs-page">
      <PageHeader
        kicker="My charges"
        title="Charges & payments"
        lede="Your building charges, what has been paid, and what is still open."
      />

      {error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>{error}</span>
        </div>
      )}

      {!charges && !error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>Reading your statement…</span>
        </div>
      )}

      {charges && charges.length === 0 && (
        <div className="rs-empty">
          <span className="rs-empty-icon">
            <IconWallet size={20} />
          </span>
          <h2>No charges yet</h2>
          <p>
            When building management issues a charge for your home, it appears here with its due date, and
            your payments are tracked against it.
          </p>
        </div>
      )}

      {charges && charges.length > 0 && (
        <>
          <section className={`rs-due${nextDue && isOverdue(nextDue) ? ' is-overdue' : ''}`} aria-labelledby="next-due">
            <div className="rs-due-main">
              <p className="rs-due-label" id="next-due">
                {nextDue ? (isOverdue(nextDue) ? 'Overdue' : 'Next payment') : 'All paid'}
              </p>
              <p className="rs-due-amount">{usd.format(nextDue ? nextDue.amountDue - nextDue.amountPaid : 0)}</p>
              <p className="rs-due-meta">
                {nextDue
                  ? `${monthYear(nextDue.period)} · due ${shortDate(nextDue.dueDate)} · ${dueIn(nextDue.dueDate)}`
                  : 'Nothing is due on your home.'}
              </p>
            </div>
            <div className="rs-due-how">
              <h2>How to pay</h2>
              <p>
                Arrange a bank transfer or hand your payment to building management. It is recorded here once
                received; online card payment is not enabled yet.
              </p>
            </div>
          </section>

          <div className="rs-tiles rs-tiles-4">
            <div className="rs-tile">
              <span className="rs-tile-label">Balance due</span>
              <strong className={`rs-tile-value${stats.balance > 0 ? ' is-danger' : ' is-ok'}`}>
                {usd.format(stats.balance)}
              </strong>
              <span className="rs-tile-note">
                {stats.overdueCount > 0
                  ? `${stats.overdueCount} ${stats.overdueCount === 1 ? 'charge' : 'charges'} overdue`
                  : 'Nothing overdue'}
              </span>
            </div>

            <div className="rs-tile">
              <span className="rs-tile-label">Billed this year</span>
              <strong className="rs-tile-value">{usd.format(stats.dueYTD)}</strong>
              <span className="rs-tile-note">{new Date().getFullYear()} service charges</span>
            </div>

            <div className="rs-tile">
              <span className="rs-tile-label">Paid this year</span>
              <strong className="rs-tile-value is-ok">{usd.format(stats.paidYTD)}</strong>
              <span className="rs-tile-note">{stats.paidPct}% of what was billed</span>
            </div>

            <div className="rs-tile">
              <span className="rs-tile-label">Overdue</span>
              <strong className={`rs-tile-value${stats.overdueTotal > 0 ? ' is-danger' : ''}`}>
                {usd.format(stats.overdueTotal)}
              </strong>
              <span className="rs-tile-note">
                {stats.overdueCount === 0
                  ? 'You are up to date'
                  : `Oldest due ${shortDate(
                      [...charges].filter(isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate ??
                        new Date().toISOString(),
                    )}`}
              </span>
            </div>
          </div>

          <section className="rs-card" style={{ marginTop: 18 }} aria-labelledby="statement">
            <div className="rs-toolbar">
              <div className="rs-card-head" style={{ marginBottom: 0 }}>
                <h2 id="statement">Statement</h2>
              </div>

              <div className="rs-filters">
                <label className="rs-select">
                  <span>Period</span>
                  <select
                    value={dateRange}
                    onChange={(event) => {
                      setDateRange(event.target.value as typeof dateRange);
                      setPage(1);
                    }}
                  >
                    {DATE_RANGES.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="rs-select">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value as typeof statusFilter);
                      setPage(1);
                    }}
                  >
                    {STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="rs-table">
              <div className="rs-table-head">
                <span>Period</span>
                <span>Description</span>
                <span>Due</span>
                <span>Paid</span>
                <span>Status</span>
              </div>

              {pageRows.map((charge) => {
                const status = statusOf(charge);
                return (
                  <div key={charge.id} className="rs-table-row">
                    <span className="rs-table-period">
                      {monthYear(charge.period)}
                      <em>
                        <IconCalendar size={11} /> due {shortDate(charge.dueDate)}
                      </em>
                    </span>
                    <span>Monthly service charge</span>
                    <span className="is-num">{usd.format(charge.amountDue)}</span>
                    <span className="is-num">{usd.format(charge.amountPaid)}</span>
                    <span>
                      <span className={`rs-pill is-${status.tone}`}>{status.label}</span>
                    </span>
                  </div>
                );
              })}

              {pageRows.length === 0 && (
                <div className="rs-empty" style={{ marginTop: 16 }}>
                  <p>No charges match these filters.</p>
                </div>
              )}
            </div>

            <div className="rs-pager">
              <span>
                {filtered.length === 0
                  ? 'No charges'
                  : `Showing ${firstRow}–${lastRow} of ${filtered.length}`}
              </span>

              {totalPages > 1 && (
                <div className="rs-pager-btns">
                  <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                    <button
                      key={number}
                      type="button"
                      className={number === safePage ? 'is-active' : ''}
                      onClick={() => setPage(number)}
                      aria-current={number === safePage ? 'page' : undefined}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(safePage + 1)}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="rs-chart-grid">
            <section className="rs-card" aria-labelledby="year-overview">
              <h2 id="year-overview" className="rs-chart-title">
                This year
              </h2>
              <div className="rs-donut-wrap">
                <VoteDonut
                  segments={[
                    { value: stats.paidYTD, color: 'var(--r-green)' },
                    { value: unpaidYTD, color: 'var(--r-danger)' },
                  ]}
                  size={124}
                  stroke={15}
                  centerLabel={`${stats.paidPct}%`}
                  centerSub="paid"
                />
                <ul className="rs-legend">
                  <li className="rs-legend-row">
                    <span className="rs-legend-dot" style={{ background: 'var(--r-green)' }} />
                    <span>Paid</span>
                    <strong>{usd.format(stats.paidYTD)}</strong>
                  </li>
                  <li className="rs-legend-row">
                    <span className="rs-legend-dot" style={{ background: 'var(--r-danger)' }} />
                    <span>Still due</span>
                    <strong>{usd.format(unpaidYTD)}</strong>
                  </li>
                  <li className="rs-legend-row">
                    <span className="rs-legend-dot" style={{ background: 'transparent' }} />
                    <span>Billed</span>
                    <strong>{usd.format(stats.dueYTD)}</strong>
                  </li>
                </ul>
              </div>
            </section>

            <section className="rs-card" aria-labelledby="over-time">
              <h2 id="over-time" className="rs-chart-title">
                Last six months
              </h2>
              <LineChart
                labels={chartData.labels}
                series={[
                  { label: 'Billed', color: 'var(--r-gold)', values: chartData.due },
                  { label: 'Paid', color: 'var(--r-green-2)', values: chartData.paid },
                ]}
              />
            </section>
          </div>

          <div className="rs-note" style={{ marginTop: 18 }}>
            <IconDocument size={15} />
            <span>Questions about a charge? Contact building management and quote the period above.</span>
          </div>
        </>
      )}
    </div>
  );
}
