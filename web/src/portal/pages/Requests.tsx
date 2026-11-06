import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type ResidentRequest } from '../api';
import { shortDate } from '../format';
import PageHeader from '../PageHeader';
import { IconWrench, IconHammer, IconCheck, IconClock, IconAlertCircle, IconClipboard } from '../../components/Icons';

const TYPES: { value: 'ISSUE' | 'RENOVATION'; label: string; icon: typeof IconWrench }[] = [
  { value: 'ISSUE', label: 'Report a problem', icon: IconAlertCircle },
  { value: 'RENOVATION', label: 'Renovation', icon: IconHammer },
];

const CATEGORIES = ['Plumbing', 'Electrical', 'Kitchen', 'HVAC', 'Structural', 'Appliances', 'Other'];

const STATUS: Record<ResidentRequest['status'], { label: string; tone: string; className: string }> = {
  OPEN: { label: 'Received', tone: 'warn', className: 'is-open' },
  IN_PROGRESS: { label: 'In progress', tone: 'open', className: 'is-progress' },
  RESOLVED: { label: 'Resolved', tone: 'ok', className: 'is-resolved' },
};

const FILTERS = ['All requests', 'Received', 'In progress', 'Resolved'] as const;
type Filter = (typeof FILTERS)[number];

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(iso);
}

export default function Requests() {
  const [requests, setRequests] = useState<ResidentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [type, setType] = useState<'ISSUE' | 'RENOVATION'>('ISSUE');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState<Filter>('All requests');

  function load() {
    api
      .get<{ requests: ResidentRequest[] }>('/resident/requests')
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/resident/requests', { type, category, description });
      setCategory('');
      setDescription('');
      setJustSubmitted(true);
      load();
      setTimeout(() => setJustSubmitted(false), 5000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your request.');
    } finally {
      setSubmitting(false);
    }
  }

  const active = requests?.filter((request) => request.status !== 'RESOLVED').length ?? 0;

  const filtered = useMemo(() => {
    const list = requests ?? [];
    if (filter === 'All requests') return list;
    return list.filter((request) => STATUS[request.status].label === filter);
  }, [requests, filter]);

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Requests"
        title="How can we help?"
        lede={
          <>
            Report something that needs fixing, or start a renovation conversation. Management sees every
            request that comes through here.
            {active > 0 && (
              <>
                {' '}
                You have <strong style={{ color: 'var(--r-green)', fontWeight: 650 }}>{active}</strong> active
                {active === 1 ? ' request' : ' requests'}.
              </>
            )}
          </>
        }
      />

      <div className="rs-request-layout">
        <section className="rs-panel" aria-labelledby="new-request">
          <h2 id="new-request" className="rs-panel-title">
            New request
          </h2>
          <p className="rs-panel-sub">A few details help us route it to the right person.</p>

          <div className="rs-segmented" role="group" aria-label="Request type">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={type === option.value ? 'is-active' : ''}
                aria-pressed={type === option.value}
                onClick={() => setType(option.value)}
              >
                <option.icon size={15} />
                {option.label}
              </button>
            ))}
          </div>

          <form className="rs-form" onSubmit={handleSubmit}>
            <label className="rs-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} required>
                <option value="" disabled>
                  Select a category
                </option>
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="rs-field">
              <span>{type === 'ISSUE' ? "What's going on?" : 'Tell us about the project'}</span>
              <textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  type === 'ISSUE'
                    ? 'What is wrong, and where is it? For example: the kitchen tap is dripping.'
                    : 'What are you planning, and what do you need from management?'
                }
                required
              />
            </label>

            {error && (
              <div className="rs-note">
                <IconAlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {justSubmitted ? (
              <div
                className="rs-note"
                role="status"
                style={{ borderColor: 'rgba(44, 99, 69, 0.35)', color: 'var(--r-ok-ink)' }}
              >
                <IconCheck size={15} />
                <span>Request received. Management will follow up here.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <button type="submit" className="rs-btn rs-btn-primary" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--r-faint)' }}>
                  You can follow its progress below.
                </span>
              </div>
            )}
          </form>
        </section>

        <aside className="rs-panel rs-help">
          <h2>Need urgent assistance?</h2>
          <p>
            For a leak, a power failure or anything unsafe, contact building management directly rather than
            waiting for a request to be picked up.
          </p>
          <Link to="/location" className="rs-btn rs-btn-outline rs-btn-sm">
            <IconAlertCircle size={14} /> Contact management
          </Link>
        </aside>
      </div>

      {requests && requests.length > 0 && (
        <>
          <div className="rs-section-head">
            <h2>Your requests</h2>
            <div className="rs-chip-row" role="group" aria-label="Filter requests">
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={filter === option ? 'is-active' : ''}
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="rs-history" style={{ marginTop: 0 }}>
            {filtered.map((request) => {
              const status = STATUS[request.status];
              const TypeIcon = request.type === 'ISSUE' ? IconWrench : IconHammer;
              return (
                <article key={request.id} className={`rs-request ${status.className}`}>
                  <span className="rs-request-icon">
                    <TypeIcon size={17} />
                  </span>
                  <div className="rs-request-body">
                    <div className="rs-request-head">
                      <strong>
                        {request.category}
                        <em> · {request.type === 'ISSUE' ? 'Issue' : 'Renovation'}</em>
                      </strong>
                      <span className={`rs-pill is-${status.tone}`}>{status.label}</span>
                    </div>
                    <p>{request.description}</p>
                    <span className="rs-request-time">
                      <IconClock size={12} /> {timeAgo(request.createdAt)}
                    </span>
                  </div>
                </article>
              );
            })}

            {filtered.length === 0 && (
              <div className="rs-empty">
                <p>No requests in this view.</p>
              </div>
            )}
          </div>
        </>
      )}

      {requests && requests.length === 0 && (
        <div className="rs-empty" style={{ marginTop: 24 }}>
          <span className="rs-empty-icon">
            <IconClipboard size={20} />
          </span>
          <h2>No requests yet</h2>
          <p>When you report something, its progress appears here so you always know where it stands.</p>
        </div>
      )}
    </div>
  );
}
