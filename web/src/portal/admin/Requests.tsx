import { useEffect, useState } from 'react';
import { api, type AdminRequest } from '../api';
import { IconClipboard } from '../../components/Icons';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

export default function AdminRequests() {
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<{ requests: AdminRequest[] }>('/admin/requests')
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    await api.patch(`/admin/requests/${id}`, { status });
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Requests</p>
      <h1>Maintenance &amp; Renovation Requests</h1>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-timeline admin-request-list">
        {requests?.map((r) => (
          <div key={r.id} className={`portal-timeline-item portal-timeline-${r.status.toLowerCase()}`}>
            <span className="portal-timeline-dot" />
            <div className="portal-timeline-card">
              <div className="portal-timeline-card-head">
                <strong>
                  {r.category}{' '}
                  <span className="portal-request-type">
                    · {r.type === 'ISSUE' ? 'Issue' : 'Renovation'}
                  </span>
                </strong>
                <select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className="admin-status-select"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <p>{r.description}</p>
              <div className="admin-request-meta">
                <IconClipboard size={13} />
                <span>
                  Unit {r.unit.block}-{r.unit.number} · {r.account.name} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
        {requests?.length === 0 && <p className="portal-empty-note">No requests yet.</p>}
      </div>
    </div>
  );
}
