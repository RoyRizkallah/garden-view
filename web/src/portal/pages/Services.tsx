import { useEffect, useState, type FormEvent } from 'react';
import {
  IconArrowRight,
  IconClose,
  IconHammer,
  IconLamp,
  IconShield,
  IconSparkle,
  IconSun,
  IconWaves,
  IconWrench,
} from '../../components/Icons';
import { api, ApiError, type ServiceCategory, type ServiceRequest, type ServiceStatus } from '../api';

const SERVICES: { id: ServiceCategory; title: string; blurb: string; icon: typeof IconLamp }[] = [
  { id: 'ELECTRICIAN', title: 'Electrician', blurb: 'Lighting, outlets and electrical repairs', icon: IconLamp },
  { id: 'PLUMBER', title: 'Plumber', blurb: 'Leaks, fittings and water systems', icon: IconWaves },
  { id: 'AIR_CONDITIONING', title: 'Air conditioning', blurb: 'Cooling checks and maintenance', icon: IconSun },
  { id: 'CLEANING', title: 'Cleaning', blurb: 'A fresh start for your space', icon: IconSparkle },
  { id: 'HANDYMAN', title: 'Handyman', blurb: 'Everyday fixes and small repairs', icon: IconHammer },
  { id: 'OTHER', title: 'Other', blurb: 'Tell us what you need', icon: IconWrench },
];

const STATUS_LABEL: Record<ServiceStatus, string> = {
  SUBMITTED: 'Received',
  IN_REVIEW: 'Finding a quote',
  SCHEDULED: 'Scheduled',
  DONE: 'Done',
  DECLINED: 'Closed',
};

const titleOf = (category: ServiceCategory) => SERVICES.find((service) => service.id === category)?.title ?? 'Service';

export default function Services() {
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [open, setOpen] = useState<ServiceCategory | 'choose' | null>(null);
  const [description, setDescription] = useState('');
  const [timing, setTiming] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('ELECTRICIAN');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get<{ requests: ServiceRequest[] }>('/resident/service-requests')
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function openFor(next: ServiceCategory | 'choose') {
    setOpen(next);
    setError(null);
    setDescription('');
    setTiming('');
    if (next !== 'choose') setCategory(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/resident/service-requests', {
        category,
        description,
        timing: timing.trim() || undefined,
      });
      setOpen(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-page svc-page">
      <header className="svc-head">
        <div>
          <p className="svc-kicker">Good people. The right help.</p>
          <h1>A little help for your home.</h1>
          <p>Request support from trusted third-party professionals.</p>
        </div>
        <button type="button" className="svc-add" aria-label="New request" onClick={() => openFor('choose')}>
          +
        </button>
      </header>

      <aside className="svc-promise">
        <span className="svc-promise-icon">
          <IconShield size={18} />
        </span>
        <div>
          <strong>Trusted third parties. Clear expectations.</strong>
          <p>
            Garden View helps coordinate your request. Services are delivered by independent providers. We seek
            competitive quotes; prices depend on the job and are agreed with you before work begins.
          </p>
        </div>
      </aside>

      {error && !open && <div className="note-card">{error}</div>}

      <div className="svc-grid">
        {SERVICES.map((service) => (
          <article key={service.id} className="svc-card">
            <span className="svc-icon">
              <service.icon size={18} />
            </span>
            <h2>{service.title}</h2>
            <p>{service.blurb}</p>
            <button type="button" onClick={() => openFor(service.id)}>
              Request support <IconArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>

      <section className="svc-yours">
        <h2>Your requests</h2>
        {requests && requests.length === 0 && <p>When you ask for a trade, the request and its progress appear here.</p>}
        <ul>
          {requests?.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{titleOf(request.category)}</strong>
                <span>{request.description}</span>
                {request.managementNote && <em>{request.managementNote}</em>}
              </div>
              <b className={`svc-status is-${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</b>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <div className="svc-drawer-back" onClick={() => setOpen(null)}>
          <form className="svc-drawer" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <header>
              <div>
                <p>Request support</p>
                <h2>{open === 'choose' ? 'What do you need?' : titleOf(category)}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(null)}>
                <IconClose size={18} />
              </button>
            </header>
            {open === 'choose' && (
              <label>
                Trade
                <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory)}>
                  {SERVICES.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              What should they do?
              <textarea
                required
                minLength={8}
                rows={5}
                value={description}
                placeholder="Where it is, and what is wrong."
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              When works for you
              <input
                value={timing}
                placeholder="This week, mornings, after 5…"
                onChange={(e) => setTiming(e.target.value)}
              />
            </label>
            {error && <p className="svc-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send request'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
