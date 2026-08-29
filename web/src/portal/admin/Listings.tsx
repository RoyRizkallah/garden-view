import { useEffect, useState } from 'react';
import { api, type AdminListingRequest } from '../api';
import { IconTag } from '../../components/Icons';

const STATUSES = ['PENDING', 'REVIEWING', 'APPROVED', 'DECLINED'] as const;
const FURNISHED_LABEL: Record<string, string> = {
  FURNISHED: 'Furnished',
  SEMI_FURNISHED: 'Semi-furnished',
  UNFURNISHED: 'Unfurnished',
};

export default function AdminListings() {
  const [listings, setListings] = useState<AdminListingRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<{ listingRequests: AdminListingRequest[] }>('/admin/listing-requests')
      .then((res) => setListings(res.listingRequests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    await api.patch(`/admin/listing-requests/${id}`, { status });
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Listings</p>
      <h1>Sale &amp; Rental Requests</h1>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-timeline admin-request-list">
        {listings?.map((l) => (
          <div key={l.id} className={`portal-timeline-item portal-timeline-${l.status.toLowerCase()}`}>
            <span className="portal-timeline-dot" />
            <div className="portal-timeline-card">
              <div className="portal-timeline-card-head">
                <strong>
                  {l.type === 'SALE' ? 'For Sale' : 'For Rent'}
                  {l.askingPrice != null && (
                    <span className="portal-request-type"> · ${l.askingPrice.toLocaleString()}</span>
                  )}
                </strong>
                <select
                  value={l.status}
                  onChange={(e) => updateStatus(l.id, e.target.value)}
                  className="admin-status-select"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {l.notes && <p>{l.notes}</p>}
              <div className="admin-request-meta">
                <IconTag size={13} />
                <span>
                  Unit {l.unit.block}-{l.unit.number} · {l.account.name} ·{' '}
                  {new Date(l.createdAt).toLocaleDateString()}
                  {l.availableFrom && ` · Available ${new Date(l.availableFrom).toLocaleDateString()}`}
                  {l.leaseDuration && ` · ${l.leaseDuration}`}
                  {l.furnished && ` · ${FURNISHED_LABEL[l.furnished]}`}
                </span>
              </div>
            </div>
          </div>
        ))}
        {listings?.length === 0 && <p className="portal-empty-note">No sale or rental requests yet.</p>}
      </div>
    </div>
  );
}
