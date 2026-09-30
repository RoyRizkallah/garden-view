import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type ResidentUnit } from '../api';
import { IconCheck, IconSearch, IconChevronRight, IconUser } from '../../components/Icons';
import { matchResidence } from '../../data/useUnitPlan';
import { UNIT_KIND_LABEL } from '../../data/buildingExplorer';
import BulkAccess from './BulkAccess';

// The owner directory: every registered home, who owns it, and whether they can sign in to the
// resident portal. One line per home; a line opens to the directory's notes and, for homes
// without an account yet, a form that creates one and hands back ready-to-send sign-in details.

const BLOCKS = ['All', 'A', 'B', 'C'] as const;
const ACCESS = ['All', 'Invited', 'Not yet'] as const;
type BlockFilter = (typeof BLOCKS)[number];
type AccessFilter = (typeof ACCESS)[number];

/** 12 characters from an unambiguous alphabet, from the browser's secure random source. */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

const validEmail = (e: string | null | undefined) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
const kindOf = (u: ResidentUnit) => {
  const r = matchResidence(u.block, u.number);
  return r ? UNIT_KIND_LABEL[r.kind].split(' · ')[0] : null;
};

type Created = { email: string; password: string };

export default function AdminResidents() {
  const [units, setUnits] = useState<ResidentUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, Created>>({});
  const [search, setSearch] = useState('');
  const [block, setBlock] = useState<BlockFilter>('All');
  const [access, setAccess] = useState<AccessFilter>('All');

  function load() {
    api
      .get<{ units: ResidentUnit[] }>('/admin/residents')
      .then((res) => setUnits(res.units))
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  const total = units?.length ?? 0;
  const invited = units?.filter((u) => u.account).length ?? 0;

  const list = useMemo(() => {
    let l = units ?? [];
    if (block !== 'All') l = l.filter((u) => u.block === block);
    if (access === 'Invited') l = l.filter((u) => u.account);
    if (access === 'Not yet') l = l.filter((u) => !u.account);
    const q = search.trim().toLowerCase();
    if (q) {
      l = l.filter((u) =>
        [u.number, u.registrationNo, u.ownerName, u.ownerPhone, u.ownerEmail, u.account?.name, u.account?.email]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q)),
      );
    }
    return [...l].sort((a, b) => a.block.localeCompare(b.block) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [units, block, access, search]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Residents</p>
      <h1>Owner Directory</h1>
      <p className="portal-page-lede">Every home at Garden View, its owner, and their access to the resident portal.</p>

      {error && <div className="note-card">{error}</div>}

      {units && (
        <div className="ad-adoption">
          <div>
            <strong>
              {invited} of {total}
            </strong>{' '}
            homes can sign in to the resident portal
          </div>
          <div className="ad-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={invited}>
            <span style={{ width: `${total ? (invited / total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {units && <BulkAccess units={units} onDone={load} />}

      <div className="ad-toolbar">
        <div className="admin-resident-search">
          <IconSearch size={16} />
          <input type="search" placeholder="Search name, home, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ad-chips" role="group" aria-label="Block">
          {BLOCKS.map((b) => (
            <button key={b} type="button" aria-pressed={block === b} onClick={() => setBlock(b)}>
              {b === 'All' ? 'All blocks' : `Block ${b}`}
            </button>
          ))}
        </div>
        <div className="ad-chips" role="group" aria-label="Portal access">
          {ACCESS.map((a) => (
            <button key={a} type="button" aria-pressed={access === a} onClick={() => setAccess(a)}>
              {a === 'All' ? 'Everyone' : a === 'Invited' ? 'Has access' : 'No access yet'}
            </button>
          ))}
        </div>
      </div>

      {units && list.length === 0 && <p className="portal-empty-note">No homes match these filters.</p>}

      <ul className="ad-directory">
        {list.map((u) => {
          const isOpen = open === u.id;
          const made = created[u.id];
          const kind = kindOf(u);
          return (
            <li key={u.id} className={isOpen ? 'is-open' : ''}>
              <button type="button" className="ad-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : u.id)}>
                <span className="ad-home">
                  <strong>{u.number}</strong>
                  <span>
                    Block {u.block}
                    {kind ? ` · ${kind}` : ''}
                  </span>
                </span>
                <span className="ad-owner">
                  <strong>{u.ownerName ?? 'Owner not on file'}</strong>
                  <span>{[u.ownerPhone, u.ownerEmail].filter(Boolean).join(' · ') || 'No contact details'}</span>
                </span>
                <span className="ad-access">
                  {u.account || made ? (
                    <span className="ad-pill is-on">
                      <IconCheck size={12} /> Has access
                    </span>
                  ) : (
                    <span className="ad-pill">No access yet</span>
                  )}
                  {u.dataNotes && <span className="ad-note-dot" title="The directory has a note on this home" />}
                </span>
                <IconChevronRight size={16} className="ad-chevron" />
              </button>

              {isOpen && (
                <div className="ad-detail">
                  {u.dataNotes && (
                    <div className="ad-import-note">
                      <p className="ad-label">Note from the owner directory</p>
                      <p>{u.dataNotes.replace(/\s*--\s*/g, ' · ')}</p>
                    </div>
                  )}
                  {u.registrationNo && (
                    <p className="ad-meta">
                      Registration {u.registrationNo}
                      {u.sizeSqm ? ` · ${u.sizeSqm} m² registered` : ''}
                    </p>
                  )}
                  {made ? (
                    <SignInDetails created={made} />
                  ) : u.account ? (
                    <div className="ad-account">
                      <IconUser size={16} />
                      <div>
                        <strong>{u.account.name}</strong>
                        <span>Signs in as {u.account.email}</span>
                      </div>
                      <ResetPassword unitId={u.id} email={u.account.email} onReset={(c) => setCreated((prev) => ({ ...prev, [u.id]: c }))} />
                    </div>
                  ) : (
                    <CreateAccount
                      unit={u}
                      onCreated={(c) => {
                        setCreated((prev) => ({ ...prev, [u.id]: c }));
                        load();
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreateAccount({ unit, onCreated }: { unit: ResidentUnit; onCreated: (c: Created) => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    try {
      await api.post(`/admin/units/${unit.id}/account`, { email, password, name: String(form.get('name') ?? '').trim() || undefined });
      onCreated({ email, password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account.');
      setSubmitting(false);
    }
  }

  return (
    <form className="ad-create" onSubmit={submit}>
      <p className="ad-label">Give this owner access to the resident portal</p>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`email-${unit.id}`}>Their email</label>
          <input id={`email-${unit.id}`} name="email" type="email" required defaultValue={validEmail(unit.ownerEmail) ? unit.ownerEmail!.trim() : ''} autoFocus />
        </div>
        <div className="form-field">
          <label htmlFor={`name-${unit.id}`}>Name shown in the portal</label>
          <input id={`name-${unit.id}`} name="name" defaultValue={unit.ownerName ?? ''} />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`pw-${unit.id}`}>Temporary password</label>
        <div className="ad-password">
          <input id={`pw-${unit.id}`} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required spellCheck={false} />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPassword(generatePassword())}>
            New password
          </button>
        </div>
      </div>
      {error && <div className="note-card">{error}</div>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Account'}
      </button>
    </form>
  );
}

/** Shown once, right after creating an account: the details to send the owner, with a copy button. */
function SignInDetails({ created }: { created: Created }) {
  const [copied, setCopied] = useState(false);
  const text = `Your Garden View resident portal\nSign in at ${window.location.origin}/login\nEmail: ${created.email}\nTemporary password: ${created.password}\nYou can change the password under Profile once signed in.`;
  return (
    <div className="ad-created">
      <p className="ad-label">
        <IconCheck size={14} /> Account created. Send these details to the owner
      </p>
      <pre>{text}</pre>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() =>
          navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? 'Copied' : 'Copy sign-in details'}
      </button>
      <p className="ad-hint">The password is shown only now. If the owner loses it, open their home here and choose Reset password.</p>
    </div>
  );
}

/** Sets a new temporary password for an owner who has forgotten theirs. */
function ResetPassword({ unitId, email, onReset }: { unitId: string; email: string; onReset: (c: Created) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <button type="button" className="ad-link" onClick={() => setConfirming(true)}>
        Reset password
      </button>
    );
  }
  return (
    <span className="ad-reset">
      {error ? <span className="ad-error">{error}</span> : <span>Replace their password with a new temporary one?</span>}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const password = generatePassword();
          try {
            await api.post(`/admin/units/${unitId}/account/password`, { password });
            onReset({ email, password });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not reset the password.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Resetting…' : 'Reset password'}
      </button>
    </span>
  );
}
