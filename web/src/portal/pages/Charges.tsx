import { useEffect, useMemo, useState } from 'react';
import { api, type Charge } from '../api';
import VoteDonut from '../VoteDonut';
import LineChart from '../LineChart';
import { IconCalendar, IconDocument } from '../../components/Icons';
import EmptyState from '../EmptyState';

const PAGE_SIZE = 5;
const DATE_RANGES = ['All Time', 'This Year', 'Last 6 Months', 'Last 3 Months'] as const;
const STATUS_FILTERS = ['All Statuses', 'Due', 'Paid', 'Overdue'] as const;

function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function periodShort(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
function isOverdue(c: Charge) {
  return c.status !== 'PAID' && new Date(c.dueDate) < new Date();
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
    const now = new Date();
    const year = now.getFullYear();
    const inYear = (c: Charge) => Number(c.period.slice(0, 4)) === year;

    const balance = all.reduce((sum, c) => sum + (c.amountDue - c.amountPaid), 0);
    const totalDueYTD = all.filter(inYear).reduce((sum, c) => sum + c.amountDue, 0);
    const totalPaidYTD = all.filter(inYear).reduce((sum, c) => sum + c.amountPaid, 0);
    const overdueCharges = all.filter(isOverdue);
    const totalOverdue = overdueCharges.reduce((sum, c) => sum + (c.amountDue - c.amountPaid), 0);
    const lastPaid = all
      .filter((c) => c.status === 'PAID')
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
    const accountStatus = totalOverdue > 0 ? 'Overdue' : balance > 0 ? 'Partially Paid' : 'Paid Up';

    return { balance, totalDueYTD, totalPaidYTD, totalOverdue, lastPaid, accountStatus };
  }, [charges]);

  const filtered = useMemo(() => {
    let list = charges ?? [];
    if (dateRange !== 'All Time') {
      const months = dateRange === 'This Year' ? null : dateRange === 'Last 6 Months' ? 6 : 3;
      const now = new Date();
      list = list.filter((c) => {
        const [y, m] = c.period.split('-').map(Number);
        const periodDate = new Date(y, m - 1, 1);
        if (months === null) return y === now.getFullYear();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
        return periodDate >= cutoff;
      });
    }
    if (statusFilter !== 'All Statuses') {
      list = list.filter((c) =>
        statusFilter === 'Overdue' ? isOverdue(c) : c.status === statusFilter.toUpperCase(),
      );
    }
    return [...list].sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [charges, dateRange, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chartData = useMemo(() => {
    const list = [...(charges ?? [])].sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
    return {
      labels: list.map((c) => periodShort(c.period)),
      paid: list.map((c) => c.amountPaid),
      due: list.map((c) => c.amountDue),
    };
  }, [charges]);

  return (
    <div className="portal-page">
      <p className="eyebrow">My Charges</p>
      <h1>Dues &amp; Payment History</h1>
      <p className="portal-page-lede" style={{ marginTop: -20 }}>
        View your dues and track payment status.
      </p>

      {error && <div className="note-card">{error}</div>}

      {charges && charges.length === 0 && (
        <EmptyState icon={<IconDocument size={22} />} title="No charges yet">
          When building management issues a charge for your home, such as the monthly service charge, it
          appears here with its due date, and your payments are tracked against it.
        </EmptyState>
      )}

      {charges && charges.length > 0 && (
        <>
          <div className="portal-charge-summary">
            <div className="portal-charge-summary-item">
              <span>Current Balance Due</span>
              <strong>${stats.balance.toFixed(2)}</strong>
              {charges[0] && <em>Due {new Date(charges[0].dueDate).toLocaleDateString()}</em>}
            </div>
            <div className="portal-charge-summary-item">
              <span>Total Due (YTD)</span>
              <strong>${stats.totalDueYTD.toFixed(2)}</strong>
            </div>
            <div className="portal-charge-summary-item">
              <span>Total Paid (YTD)</span>
              <strong className="is-positive">${stats.totalPaidYTD.toFixed(2)}</strong>
            </div>
            <div className="portal-charge-summary-item">
              <span>Total Overdue</span>
              <strong className={stats.totalOverdue > 0 ? 'is-negative' : ''}>
                ${stats.totalOverdue.toFixed(2)}
              </strong>
            </div>
            <div className="portal-charge-summary-item">
              <span>Account Status</span>
              <span className={`portal-badge portal-account-status-badge status-${stats.accountStatus.toLowerCase().replace(' ', '-')}`}>
                {stats.accountStatus}
              </span>
              {stats.lastPaid && <em>Last payment on {new Date(stats.lastPaid.dueDate).toLocaleDateString()}</em>}
            </div>
          </div>

          <div className="portal-charge-toolbar">
            <div className="form-field">
              <label htmlFor="dateRange">Date Range</label>
              <select
                id="dateRange"
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value as typeof dateRange);
                  setPage(1);
                }}
              >
                {DATE_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="statusFilter">Status</label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="portal-charge-table">
            <div className="portal-charge-table-head">
              <span>Date</span>
              <span>Description</span>
              <span>Due Amount</span>
              <span>Paid Amount</span>
              <span>Status</span>
            </div>
            {pageRows.map((c) => (
              <div key={c.id} className="portal-charge-table-row">
                <span>
                  <IconCalendar size={14} /> {new Date(c.dueDate).toLocaleDateString()}
                </span>
                <span>{periodLabel(c.period)} Maintenance Fee</span>
                <span>${c.amountDue.toFixed(2)}</span>
                <span>${c.amountPaid.toFixed(2)}</span>
                <span className={`portal-badge portal-badge-${(isOverdue(c) ? 'overdue' : c.status).toLowerCase()}`}>
                  {isOverdue(c) ? 'OVERDUE' : c.status}
                </span>
              </div>
            ))}
            {pageRows.length === 0 && <p className="portal-empty-note">No charges match this filter.</p>}
          </div>

          {filtered.length > 0 && (
            <div className="portal-charge-pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </span>
              <div className="portal-charge-pagination-buttons">
                <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n === page ? 'is-active' : ''}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  ›
                </button>
              </div>
            </div>
          )}

          <div className="portal-charge-charts">
            <div className="portal-charge-chart-card">
              <p className="portal-chart-title">Payment Overview (YTD)</p>
              <div className="portal-charge-donut-row">
                <VoteDonut
                  segments={[
                    { value: stats.totalPaidYTD, color: 'var(--green)' },
                    { value: Math.max(0, stats.totalDueYTD - stats.totalPaidYTD), color: '#c05a44' },
                  ]}
                  size={130}
                  stroke={16}
                  centerLabel={`$${stats.totalDueYTD.toFixed(0)}`}
                  centerSub="Total Due"
                />
                <ul className="portal-vote-legend">
                  <li>
                    <span className="portal-vote-legend-dot" style={{ background: 'var(--green)' }} />
                    <span className="portal-vote-legend-label">Paid</span>
                    <span className="portal-vote-legend-value">
                      ${stats.totalPaidYTD.toFixed(0)}{' '}
                      <em>{stats.totalDueYTD > 0 ? Math.round((stats.totalPaidYTD / stats.totalDueYTD) * 100) : 0}%</em>
                    </span>
                  </li>
                  <li>
                    <span className="portal-vote-legend-dot" style={{ background: '#c05a44' }} />
                    <span className="portal-vote-legend-label">Unpaid</span>
                    <span className="portal-vote-legend-value">
                      ${Math.max(0, stats.totalDueYTD - stats.totalPaidYTD).toFixed(0)}{' '}
                      <em>
                        {stats.totalDueYTD > 0
                          ? Math.round(((stats.totalDueYTD - stats.totalPaidYTD) / stats.totalDueYTD) * 100)
                          : 0}
                        %
                      </em>
                    </span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="portal-charge-chart-card">
              <p className="portal-chart-title">Payments Over Time</p>
              <LineChart
                labels={chartData.labels}
                series={[
                  { label: 'Paid', color: 'var(--green)', values: chartData.paid },
                  { label: 'Due', color: 'var(--gold)', values: chartData.due },
                ]}
              />
            </div>
          </div>

          <div className="portal-charge-footnote">
            <IconDocument size={16} />
            <span>Questions about your charges? Contact property management for assistance.</span>
          </div>
        </>
      )}
    </div>
  );
}
