import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type ResidentUnit } from '../api';
import { IconUsers, IconCheck, IconUser, IconSearch } from '../../components/Icons';

const BLOCK_ORDER = ['A', 'B', 'C'];
const BLOCK_FILTERS = ['All', 'A', 'B', 'C'] as const;
type BlockFilter = (typeof BLOCK_FILTERS)[number];

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminResidents() {
  const [units, setUnits] = useState<ResidentUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState<BlockFilter>('All');

  function load() {
    api
      .get<{ units: ResidentUnit[] }>('/admin/residents')
      .then((res) => setUnits(res.units))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function saveFloorPlan(unitId: string, current: string | null) {
    const value = (drafts[unitId] ?? current ?? '').trim();
    if (value === (current ?? '')) return;
    await api.patch(`/admin/units/${unitId}`, { floorPlanUrl: value });
    setUnits((prev) => prev?.map((u) => (u.id === unitId ? { ...u, floorPlanUrl: value || null } : u)) ?? prev);
  }

  async function handleCreateAccount(e: FormEvent<HTMLFormElement>, unitId: string) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api.post<{ account: { email: string } }>(`/admin/units/${unitId}/account`, {
        email: form.get('email'),
        password: form.get('password'),
        name: form.get('name') || undefined,
      });
      setAddingFor(null);
      setJustCreated((prev) => ({ ...prev, [unitId]: res.account.email }));
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  const stats = useMemo(() => {
    const all = units ?? [];
    const withAccess = all.filter((u) => u.account).length;
    return { total: all.length, withAccess, withoutAccess: all.length - withAccess };
  }, [units]);

  const filtered = useMemo(() => {
    let list = units ?? [];
    if (blockFilter !== 'All') list = list.filter((u) => u.block === blockFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        [u.number, u.registrationNo, u.ownerName, u.ownerPhone, u.ownerEmail, u.account?.name, u.account?.email]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [units, blockFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ResidentUnit[]>();
    for (const u of filtered) {
      const list = map.get(u.block) ?? [];
      list.push(u);
      map.set(u.block, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => BLOCK_ORDER.indexOf(a) - BLOCK_ORDER.indexOf(b) || a.localeCompare(b),
    );
  }, [filtered]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Residents</p>
      <h1>Owner Directory</h1>
      <p className="portal-page-lede">Provision a portal account whenever an owner is ready to use the resident app.</p>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-stat-grid" style={{ marginBottom: 28 }}>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconUsers size={20} />
          </span>
          <span className="portal-stat-label">Total Units</span>
          <span className="portal-stat-value">{stats.total}</span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconCheck size={20} />
          </span>
          <span className="portal-stat-label">With Portal Access</span>
          <span className="portal-stat-value">{stats.withAccess}</span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconUser size={20} />
          </span>
          <span className="portal-stat-label">No Account Yet</span>
          <span className="portal-stat-value">{stats.withoutAccess}</span>
        </div>
      </div>

      <div className="admin-resident-toolbar">
        <div className="admin-resident-search">
          <IconSearch size={16} />
          <input
            type="text"
            placeholder="Search by name, apt #, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="portal-filter-tabs">
          {BLOCK_FILTERS.map((b) => (
            <button key={b} className={blockFilter === b ? 'is-active' : ''} onClick={() => setBlockFilter(b)}>
              {b === 'All' ? 'All' : `Block ${b}`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="portal-empty-note" style={{ marginTop: 8 }}>
          No units match your search.
        </p>
      )}

      {grouped.map(([block, blockUnits]) => (
        <div key={block} style={{ marginBottom: 36 }}>
          <p className="portal-booking-step" style={{ marginTop: 0 }}>
            Block {block} · {blockUnits.length} units
          </p>
          <div className="admin-resident-list">
            {blockUnits.map((u) => (
              <div key={u.id} className="admin-resident-row">
                <span className="admin-resident-icon">
                  <IconUsers size={16} />
                </span>
                <div className="admin-resident-body">
                  <strong>
                    Apt {u.number}
                    {u.registrationNo && <span className="portal-request-type"> · Reg. {u.registrationNo}</span>}
                    {u.sizeSqm && <span className="portal-request-type"> · {u.sizeSqm} m²</span>}
                  </strong>
                  <p>
                    {u.ownerName ?? <span className="admin-no-account">Owner name not on file</span>}
                    {(u.ownerPhone || u.ownerEmail) && (
                      <span className="admin-owner-contact">
                        {u.ownerPhone && ` · ${u.ownerPhone}`}
                        {u.ownerEmail && ` · ${u.ownerEmail}`}
                      </span>
                    )}
                  </p>
                  {u.dataNotes && <p className="admin-data-note">{u.dataNotes}</p>}

                  <div className="admin-floorplan-field">
                    <label htmlFor={`floorplan-${u.id}`}>Floor plan URL</label>
                    <input
                      id={`floorplan-${u.id}`}
                      type="url"
                      placeholder="https://…"
                      value={drafts[u.id] ?? u.floorPlanUrl ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      onBlur={() => saveFloorPlan(u.id, u.floorPlanUrl)}
                    />
                  </div>

                  {u.account ? (
                    <p className="admin-account-status admin-account-status-active">
                      <IconCheck size={13} /> Portal access: {u.account.name} — {u.account.email}
                    </p>
                  ) : justCreated[u.id] ? (
                    <p className="admin-account-status admin-account-status-active">
                      <IconCheck size={13} /> Account created for {justCreated[u.id]}
                    </p>
                  ) : addingFor === u.id ? (
                    <form className="admin-add-account-form" onSubmit={(e) => handleCreateAccount(e, u.id)}>
                      <div className="form-row">
                        <div className="form-field">
                          <label htmlFor={`email-${u.id}`}>Email</label>
                          <input id={`email-${u.id}`} name="email" type="email" required autoFocus />
                        </div>
                        <div className="form-field">
                          <label htmlFor={`name-${u.id}`}>Name (optional)</label>
                          <input
                            id={`name-${u.id}`}
                            name="name"
                            defaultValue={u.ownerName ?? ''}
                            placeholder="Defaults to owner name"
                          />
                        </div>
                      </div>
                      <div className="admin-password-row">
                        <div className="form-field">
                          <label htmlFor={`password-${u.id}`}>Temporary password</label>
                          <input
                            id={`password-${u.id}`}
                            name="password"
                            type="text"
                            minLength={8}
                            required
                            defaultValue={generatePassword()}
                          />
                        </div>
                      </div>
                      {formError && <div className="note-card">{formError}</div>}
                      <div className="admin-add-account-actions">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                          {submitting ? 'Creating…' : 'Create Account'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setAddingFor(null);
                            setFormError(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="admin-password-hint">
                        There's no email delivery yet — share this password with the owner directly.
                      </p>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="admin-add-account-link"
                      onClick={() => {
                        setAddingFor(u.id);
                        setFormError(null);
                      }}
                    >
                      + Add Account
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
