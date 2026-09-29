import { useEffect, useState } from 'react';
import { api, type Inquiry } from '../api';
import { IconMail } from '../../components/Icons';
import EmptyState from '../EmptyState';

const STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<{ inquiries: Inquiry[] }>('/admin/inquiries')
      .then((res) => setInquiries(res.inquiries))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    await api.patch(`/admin/inquiries/${id}`, { status });
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Inquiries</p>
      <h1>Visitor Inquiries</h1>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-timeline admin-request-list">
        {inquiries?.map((inq) => (
          <div key={inq.id} className={`portal-timeline-item portal-timeline-${inq.status === 'NEW' ? 'open' : inq.status === 'CONTACTED' ? 'in_progress' : 'resolved'}`}>
            <span className="portal-timeline-dot" />
            <div className="portal-timeline-card">
              <div className="portal-timeline-card-head">
                <strong>
                  {inq.name}
                  {inq.interest && <span className="portal-request-type"> · {inq.interest}</span>}
                </strong>
                <select
                  value={inq.status}
                  onChange={(e) => updateStatus(inq.id, e.target.value)}
                  className="admin-status-select"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <p>{inq.message}</p>
              <div className="admin-request-meta">
                <IconMail size={13} />
                <span>
                  {inq.email}
                  {inq.phone && ` · ${inq.phone}`} · {new Date(inq.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
        {inquiries?.length === 0 && (
          <EmptyState icon={<IconMail size={22} />} title="No enquiries yet">
            Messages sent from the website's contact form, such as tour requests and questions about homes for sale
            or rent, arrive here.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
