import { useMemo, useState } from 'react';
import { api, ApiError, type ResidentUnit } from '../api';
import { IconCheck, IconUsers } from '../../components/Icons';

// "Give owners access": creates resident accounts for every home whose owner has an email in the
// directory, in one step. The admin sees exactly who will get access first, can leave anyone out,
// and afterwards downloads the sign-in details (the temporary passwords are shown this once).

const EMAIL = /[^\s;,/()<>]+@[^\s;,/()<>]+\.[a-z]{2,}/gi;
const firstEmail = (raw: string | null) => (raw?.match(EMAIL) ?? [])[0]?.toLowerCase() ?? null;

type Candidate = { unit: ResidentUnit; email: string };
type Result = { unitId: string; email: string; status: 'created' | 'skipped'; reason?: string; password?: string };

export default function BulkAccess({ units, onDone }: { units: ResidentUnit[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const plan = useMemo(() => {
    const taken = new Map<string, string>(); // email -> home already using it
    for (const u of units) if (u.account) taken.set(u.account.email.toLowerCase(), u.number);
    const ready: Candidate[] = [];
    const noEmail: ResidentUnit[] = [];
    const shared: Array<{ unit: ResidentUnit; with: string }> = [];
    const sorted = [...units].sort((a, b) => a.block.localeCompare(b.block) || a.number.localeCompare(b.number, undefined, { numeric: true }));
    for (const u of sorted) {
      if (u.account) continue;
      const email = firstEmail(u.ownerEmail);
      if (!email) noEmail.push(u);
      else if (taken.has(email)) shared.push({ unit: u, with: taken.get(email)! });
      else {
        taken.set(email, u.number);
        ready.push({ unit: u, email });
      }
    }
    return { ready, noEmail, shared };
  }, [units]);

  const chosen = plan.ready.filter((c) => !excluded.has(c.unit.id));
  const byUnit = new Map(units.map((u) => [u.id, u]));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ results: Result[] }>('/admin/accounts/bulk', {
        accounts: chosen.map((c) => ({ unitId: c.unit.id, email: c.email, name: c.unit.ownerName ?? undefined })),
      });
      setResults(res.results);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the accounts.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const created = (results ?? []).filter((r) => r.status === 'created');
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ['Home', 'Owner', 'Sign-in email', 'Temporary password', 'Sign in at'],
      ...created.map((r) => {
        const u = byUnit.get(r.unitId);
        return [u?.number ?? '', u?.ownerName ?? '', r.email, r.password ?? '', `${window.location.origin}/login`];
      }),
    ];
    const csv = '﻿' + rows.map((row) => row.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'garden-view-sign-in-details.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (plan.ready.length === 0 && !results) return null;

  if (results) {
    const created = results.filter((r) => r.status === 'created');
    const skipped = results.filter((r) => r.status === 'skipped');
    return (
      <section className="ad-bulk">
        <p className="ad-label">
          <IconCheck size={14} /> {created.length} {created.length === 1 ? 'owner' : 'owners'} can now sign in
        </p>
        <p>
          Download their sign-in details and send each owner their own line. The temporary passwords are shown only now;
          delete the file once they are sent. Owners can change their password under Profile.
        </p>
        {skipped.length > 0 && (
          <ul className="ad-bulk-list">
            {skipped.map((r) => (
              <li key={r.unitId}>
                <strong>{byUnit.get(r.unitId)?.number}</strong> not created: {r.reason}
              </li>
            ))}
          </ul>
        )}
        <div className="ad-bulk-actions">
          {created.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={download}>
              Download sign-in details (CSV)
            </button>
          )}
          <button type="button" className="ad-link" onClick={() => setResults(null)}>
            Close
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ad-bulk">
      <div className="ad-bulk-head">
        <IconUsers size={18} />
        <div>
          <strong>Give owners access</strong>
          <span>
            {plan.ready.length} {plan.ready.length === 1 ? 'owner has' : 'owners have'} an email in the directory and no account yet.
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Review and create'}
        </button>
      </div>

      {open && (
        <>
          <ul className="ad-bulk-list is-choice">
            {plan.ready.map((c) => (
              <li key={c.unit.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!excluded.has(c.unit.id)}
                    onChange={() =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.unit.id)) next.delete(c.unit.id);
                        else next.add(c.unit.id);
                        return next;
                      })
                    }
                  />
                  <strong>{c.unit.number}</strong>
                  <span>{c.unit.ownerName ?? 'Owner not on file'}</span>
                  <span className="ad-bulk-email">{c.email}</span>
                </label>
              </li>
            ))}
          </ul>

          {(plan.shared.length > 0 || plan.noEmail.length > 0) && (
            <div className="ad-import-note">
              {plan.shared.length > 0 && (
                <p>
                  <strong>Same owner, second home:</strong>{' '}
                  {plan.shared.map((s) => `${s.unit.number} (same email as ${s.with})`).join(', ')}. A login covers one home for
                  now, so these are left out.
                </p>
              )}
              {plan.noEmail.length > 0 && (
                <p>
                  <strong>No email on file:</strong> {plan.noEmail.map((u) => u.number).join(', ')}. Open the home below to add
                  an account once you have their email.
                </p>
              )}
            </div>
          )}

          {error && <div className="note-card">{error}</div>}
          <div className="ad-bulk-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || chosen.length === 0} onClick={create}>
              {busy ? 'Creating accounts…' : `Create ${chosen.length} ${chosen.length === 1 ? 'account' : 'accounts'}`}
            </button>
            <span className="ad-hint">Nothing is emailed: you send the sign-in details yourself afterwards.</span>
          </div>
        </>
      )}
    </section>
  );
}
