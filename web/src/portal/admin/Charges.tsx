import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminCharge } from '../api';
import { IconWallet, IconChevronRight } from '../../components/Icons';
import EmptyState from '../EmptyState';

const BLOCKS = ['ALL', 'A', 'B', 'C'] as const;

export default function AdminCharges() {
  const [charges, setCharges] = useState<AdminCharge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(new Set());

  function load() {
    api
      .get<{ charges: AdminCharge[] }>('/admin/charges')
      .then((res) => {
        setCharges(res.charges);
        setOpenPeriods((prev) => {
          if (prev.size > 0) return prev;
          const first = res.charges[0]?.period;
          return first ? new Set([first]) : prev;
        });
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api.post<{ created: number; skipped: number }>('/admin/charges/bulk', {
        period: form.get('period'),
        amountDue: Number(form.get('amountDue')),
        dueDate: form.get('dueDate'),
        block: form.get('block'),
      });
      setResult(
        `Created ${res.created} charge${res.created === 1 ? '' : 's'}` +
          (res.skipped > 0 ? ` · ${res.skipped} unit${res.skipped === 1 ? '' : 's'} already had this period` : ''),
      );
      setOpenPeriods((prev) => new Set(prev).add(String(form.get('period'))));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create charges.');
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(charge: AdminCharge) {
    await api.patch(`/admin/charges/${charge.id}`, { amountPaid: charge.amountDue, status: 'PAID' });
    load();
  }

  function togglePeriod(period: string) {
    setOpenPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AdminCharge[]>();
    for (const c of charges ?? []) {
      const list = map.get(c.period) ?? [];
      list.push(c);
      map.set(c.period, list);
    }
    return Array.from(map.entries());
  }, [charges]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Charges</p>
      <h1>Manage Dues &amp; Payments</h1>
      <p className="portal-page-lede">
        Create a charge period for some or all units, then mark payments as they come in.
      </p>

      <form className="portal-request-panel" onSubmit={handleCreate} style={{ marginBottom: 44 }}>
        <div className="portal-inline-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="period">Period</label>
              <input id="period" name="period" type="month" required />
            </div>
            <div className="form-field">
              <label htmlFor="amountDue">Amount Due ($)</label>
              <input id="amountDue" name="amountDue" type="number" min={0} step="0.01" required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="dueDate">Due Date</label>
              <input id="dueDate" name="dueDate" type="date" required />
            </div>
            <div className="form-field">
              <label htmlFor="block">Apply To</label>
              <select id="block" name="block" defaultValue="ALL">
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {b === 'ALL' ? 'All Units' : `Block ${b} Only`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="note-card">{error}</div>}
          {result && <div className="portal-success-chip">{result}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Charges'}
          </button>
        </div>
      </form>

      {grouped.map(([period, list]) => {
        const paidCount = list.filter((c) => c.status === 'PAID').length;
        const totalDue = list.reduce((sum, c) => sum + c.amountDue, 0);
        const totalPaid = list.reduce((sum, c) => sum + c.amountPaid, 0);
        const isOpen = openPeriods.has(period);

        return (
          <div key={period} className="admin-charge-period">
            <button type="button" className="admin-charge-period-head" onClick={() => togglePeriod(period)}>
              <div>
                <strong>{period}</strong>
                <span>
                  {paidCount}/{list.length} paid · ${totalPaid.toLocaleString()} of ${totalDue.toLocaleString()}{' '}
                  collected
                </span>
              </div>
              <IconChevronRight size={18} className={isOpen ? 'admin-charge-period-chevron is-open' : 'admin-charge-period-chevron'} />
            </button>

            {isOpen && (
              <div className="admin-charge-list">
                {list.map((c) => (
                  <div key={c.id} className="admin-charge-row">
                    <span className="admin-charge-unit">
                      Unit {c.unit.block}-{c.unit.number}
                    </span>
                    <span className={`portal-badge portal-badge-${c.status.toLowerCase()}`}>{c.status}</span>
                    <span className="admin-charge-amounts">
                      ${c.amountPaid.toFixed(2)} / ${c.amountDue.toFixed(2)}
                    </span>
                    {c.status !== 'PAID' && (
                      <button type="button" className="admin-charge-mark-paid" onClick={() => markPaid(c)}>
                        <IconWallet size={13} /> Mark Paid
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {grouped.length === 0 && (
        <EmptyState icon={<IconWallet size={22} />} title="No charges issued yet">
          Create a charge period above, for example this month's service charge for all 41 homes. Each owner then
          sees it in their portal, and you mark payments here as they come in.
        </EmptyState>
      )}
    </div>
  );
}
