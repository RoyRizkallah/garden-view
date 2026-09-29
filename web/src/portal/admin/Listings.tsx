import { useEffect, useState } from 'react';
import { api, mediaUrl, type AdminListingRequest } from '../api';
import { IconTag } from '../../components/Icons';

const STATUSES = ['PENDING', 'REVIEWING', 'APPROVED', 'DECLINED', 'WITHDRAWN'] as const;
// APPROVED is what publishes a listing on the public For Sale & Rent page (/listings); moving it to
// any other status takes it down again, e.g. once the residence is sold or let.
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  PENDING: 'Pending',
  REVIEWING: 'Reviewing',
  APPROVED: 'Approved · live on website',
  DECLINED: 'Declined · not shown',
  WITHDRAWN: 'Taken down',
};
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
      <p className="portal-empty-note" style={{ marginTop: 8 }}>
        Set a request to <strong>Approved</strong> to publish it on the public{' '}
        <a href="/listings" target="_blank" rel="noreferrer">
          For Sale &amp; Rent
        </a>{' '}
        page with the owner&rsquo;s photos, and to any other status to take it down (for example once it is sold
        or let). Owners can also take their own listing down. The public page shows the unit, terms, description
        and photos, never the owner or their private note.
      </p>

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
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {l.photos.length > 0 ? (
                <div className="admin-listing-photos">
                  {l.photos.map((p, i) => (
                    <a key={p.id} href={mediaUrl(p.url)} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1}`}>
                      <img src={mediaUrl(p.url)} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="admin-listing-warning">No photos: this listing cannot appear on the website.</p>
              )}
              {l.description && (
                <p>
                  <strong>On the website: </strong>
                  {l.description}
                </p>
              )}
              {l.notes && (
                <p>
                  <strong>Private note: </strong>
                  {l.notes}
                </p>
              )}
              {l.status === 'APPROVED' && l.photos.length > 0 && (
                <a className="admin-listing-live" href={`/listings/${l.id}`} target="_blank" rel="noreferrer">
                  View live listing ↗
                </a>
              )}
              <div className="admin-request-meta">
                <IconTag size={13} />
                <span>
                  {l.unit.number} (Block {l.unit.block}) · {l.account.name} ·{' '}
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
