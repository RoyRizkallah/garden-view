import { useEffect, useState } from 'react';
import { api, type AdminServiceRequest, type ServiceStatus } from '../api';
import EmptyState from '../EmptyState';
import { IconWrench } from '../../components/Icons';

const STATUSES: ServiceStatus[] = ['SUBMITTED', 'IN_REVIEW', 'SCHEDULED', 'DONE', 'DECLINED'];
const LABEL: Record<ServiceStatus, string> = {
  SUBMITTED: 'Received',
  IN_REVIEW: 'Finding a quote',
  SCHEDULED: 'Scheduled',
  DONE: 'Done',
  DECLINED: 'Closed',
};
const TRADE: Record<AdminServiceRequest['category'], string> = {
  ELECTRICIAN: 'Electrician',
  PLUMBER: 'Plumber',
  AIR_CONDITIONING: 'Air conditioning',
  CLEANING: 'Cleaning',
  HANDYMAN: 'Handyman',
  OTHER: 'Other',
};

export default function AdminServices() {
  const [requests, setRequests] = useState<AdminServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function load() {
    api
      .get<{ requests: AdminServiceRequest[] }>('/admin/service-requests')
      .then((res) => {
        setRequests(res.requests);
        setNotes(Object.fromEntries(res.requests.map((request) => [request.id, request.managementNote ?? ''])));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function save(id: string, status: ServiceStatus, managementNote: string) {
    await api.patch(`/admin/service-requests/${id}`, { status, managementNote });
    load();
  }

  async function remove(request: AdminServiceRequest) {
    const what = `${TRADE[request.category]} request from ${request.account.name} (${request.unit.block}-${request.unit.number})`;
    if (!window.confirm(`Delete this ${what}? It disappears for the resident too, and cannot be undone.`)) return;
    try {
      await api.delete(`/admin/service-requests/${request.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the request.');
    }
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Services</p>
      <h1>Home services</h1>
      <p className="portal-page-lede">
        Trades the residents have asked for. Update the status, and leave the quote or the plan where they can read it.
      </p>
      {error && <div className="note-card">{error}</div>}
      <div className="ad-card svc-admin">
        {requests?.map((request) => (
          <article key={request.id}>
            <header>
              <div>
                <strong>
                  {TRADE[request.category]} · {request.unit.block}-{request.unit.number}
                </strong>
                <span>
                  {request.account.name} · {new Date(request.createdAt).toLocaleDateString()}
                  {request.timing ? ` · ${request.timing}` : ''}
                </span>
              </div>
              <select
                value={request.status}
                onChange={(e) => save(request.id, e.target.value as ServiceStatus, notes[request.id] ?? '')}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LABEL[status]}
                  </option>
                ))}
              </select>
            </header>
            <p>{request.description}</p>
            <label>
              Note for the resident
              <textarea
                rows={2}
                value={notes[request.id] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
              />
            </label>
            <div className="svc-admin-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => save(request.id, request.status, notes[request.id] ?? '')}>
                Save note
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(request)}>
                Delete
              </button>
            </div>
          </article>
        ))}
        {requests?.length === 0 && (
          <EmptyState icon={<IconWrench size={22} />} title="No service requests yet">
            When a resident asks for an electrician, a plumber, or another trade, it arrives here.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
