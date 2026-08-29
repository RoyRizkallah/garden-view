import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type ResidentRequest } from '../api';
import { IconWrench, IconHammer, IconCheck, IconClock, IconAlertCircle } from '../../components/Icons';

const TYPES: { value: 'ISSUE' | 'RENOVATION'; label: string; icon: typeof IconWrench }[] = [
  { value: 'ISSUE', label: 'Report a Problem', icon: IconAlertCircle },
  { value: 'RENOVATION', label: 'Renovation', icon: IconHammer },
];

const CATEGORIES = ['Plumbing', 'Electrical', 'Kitchen', 'HVAC', 'Structural', 'Appliances', 'Other'];

const STATUS_LABEL: Record<ResidentRequest['status'], string> = {
  OPEN: 'Received',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};
const STATUS_FILTERS = ['All Statuses', 'Received', 'In Progress', 'Resolved'] as const;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Requests() {
  const [requests, setRequests] = useState<ResidentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [type, setType] = useState<'ISSUE' | 'RENOVATION'>('ISSUE');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All Statuses');

  function load() {
    api
      .get<{ requests: ResidentRequest[] }>('/resident/requests')
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/resident/requests', { type, category, description });
      setCategory('');
      setDescription('');
      setJustSubmitted(true);
      load();
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const active = requests?.filter((r) => r.status !== 'RESOLVED').length ?? 0;

  const filtered = useMemo(() => {
    const list = requests ?? [];
    if (statusFilter === 'All Statuses') return list;
    return list.filter((r) => STATUS_LABEL[r.status] === statusFilter);
  }, [requests, statusFilter]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Requests</p>
      <h1>How Can We Help?</h1>
      <p className="portal-page-lede">
        Report a problem or start a renovation conversation — building management sees every
        request that comes through here.
        {active > 0 && (
          <>
            {' '}
            You currently have <strong className="portal-lede-accent">{active}</strong> active request
            {active === 1 ? '' : 's'}.
          </>
        )}
      </p>

      <div className="portal-request-panel">
        <div className="portal-type-toggle">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              className={type === t.value ? 'is-active' : ''}
              onClick={() => setType(t.value)}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <form className="portal-inline-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="" disabled>
                Select a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="description">
              {type === 'ISSUE' ? "What's going on?" : 'Tell us about the project'}
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'ISSUE'
                  ? 'Describe the issue and where it is...'
                  : 'What are you planning, and what do you need from us?'
              }
              required
            />
          </div>
          {error && <div className="note-card">{error}</div>}
          {justSubmitted ? (
            <div className="portal-success-chip">
              <IconCheck size={16} /> Request received — we'll follow up soon.
            </div>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Request'}
            </button>
          )}
        </form>
      </div>

      {requests && requests.length > 0 && (
        <>
          <div className="portal-section-head">
            <h2 className="portal-subheading" style={{ margin: 0 }}>
              History
            </h2>
            <div className="form-field">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="portal-timeline">
            {filtered.map((r) => {
              const TypeIcon = r.type === 'ISSUE' ? IconWrench : IconHammer;
              return (
                <div key={r.id} className={`portal-timeline-item portal-timeline-${r.status.toLowerCase()}`}>
                  <span className="portal-timeline-dot" />
                  <div className="portal-timeline-card portal-timeline-card-with-icon">
                    <span className="portal-timeline-card-icon">
                      <TypeIcon size={17} />
                    </span>
                    <div className="portal-timeline-card-content">
                      <div className="portal-timeline-card-head">
                        <strong>
                          {r.category}{' '}
                          <span className="portal-request-type">
                            · {r.type === 'ISSUE' ? 'Issue' : 'Renovation'}
                          </span>
                        </strong>
                        <span className={`portal-badge portal-badge-${r.status.toLowerCase()}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p>{r.description}</p>
                      <span className="portal-timeline-time">
                        <IconClock size={12} /> {timeAgo(r.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="portal-empty-note">No requests match this filter.</p>}
          </div>
        </>
      )}

      <div className="portal-urgent-footer">
        <IconAlertCircle size={20} />
        <div>
          <strong>Need urgent assistance?</strong>
          <span>For emergencies, please contact building management directly.</span>
        </div>
        <Link to="/location" className="btn btn-outline-gold btn-sm">
          Contact Management
        </Link>
      </div>
    </div>
  );
}
