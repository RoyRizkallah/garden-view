import { useEffect, useMemo, useState } from 'react';
import { api, type Project } from '../api';
import { IconCheck, IconCalendar, IconWallet, IconUsers, IconChart } from '../../components/Icons';
import CircularProgress from '../CircularProgress';
import Photo from '../../components/Photo';
import EmptyState from '../EmptyState';

// building-maintenance projects: the plant and spaces they concern, from the professional shoot
const PROJECT_IMAGES = ['/images/shoot/common-7.jpg', '/images/shoot/common-8.jpg', '/images/shoot/common-5.jpg', '/images/shoot/block-c-4.jpg'];
// 2-column card grid (24 px gap) in the portal main column (viewport − 264 px sidebar − 2 × 56 px padding)
const CARD_MEDIA_SIZES = '(max-width: 640px) calc(100vw - 48px), (max-width: 960px) calc(50vw - 36px), calc(50vw - 200px)';
const STATUS_FILTERS = ['All Statuses', 'Planning', 'In Progress', 'Complete'] as const;

function statusOf(p: Project): (typeof STATUS_FILTERS)[number] {
  if (p.progressPct >= 100) return 'Complete';
  if (p.progressPct <= 0) return 'Planning';
  return 'In Progress';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All Statuses');

  useEffect(() => {
    api
      .get<{ projects: Project[] }>('/resident/projects')
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const list = projects ?? [];
    if (statusFilter === 'All Statuses') return list;
    return list.filter((p) => statusOf(p) === statusFilter);
  }, [projects, statusFilter]);

  return (
    <div className="portal-page">
      <div className="portal-projects-head">
        <div>
          <p className="eyebrow">Project Progress</p>
          <h1>Building Projects</h1>
          <p className="portal-page-lede" style={{ marginTop: -20 }}>
            Track ongoing and upcoming projects across Garden View.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="statusFilter">Status</label>
          <select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-project-cards">
        {filtered.map((p, i) => {
          const milestones = p.milestones ?? [];
          const doneCount = milestones.filter((m) => m.done).length;
          const firstPendingId = milestones.find((m) => !m.done)?.id;

          return (
            <div key={p.id} className="portal-project-card">
              <div className="portal-project-card-media">
                <Photo
                  src={PROJECT_IMAGES[i % PROJECT_IMAGES.length]}
                  alt=""
                  sizes={CARD_MEDIA_SIZES}
                  eager={i < 2}
                />
                <div className="portal-project-card-media-scrim" />
                <span className="portal-project-card-status-badge">{statusOf(p).toUpperCase()}</span>
                <span className="portal-project-card-ring">
                  <CircularProgress percent={p.progressPct} size={50} stroke={4} />
                </span>
                <div className="portal-project-card-media-text">
                  <p className="portal-project-card-category">{p.category}</p>
                  <h3>{p.title}</h3>
                  {p.description && <p className="portal-project-card-media-desc">{p.description}</p>}
                </div>
              </div>
              <div className="portal-project-card-body">
                <div className="portal-project-card-split">
                  <div className="portal-project-details-col">
                    <p className="portal-project-col-label">Project Details</p>
                    <div className="portal-project-detail-item">
                      <IconCalendar size={14} />
                      <div>
                        <span>Start Date</span>
                        <strong>{p.startDate ? new Date(p.startDate).toLocaleDateString() : 'TBD'}</strong>
                      </div>
                    </div>
                    <div className="portal-project-detail-item">
                      <IconCalendar size={14} />
                      <div>
                        <span>Estimated Completion</span>
                        <strong>{p.eta ? new Date(p.eta).toLocaleDateString() : 'TBD'}</strong>
                      </div>
                    </div>
                    {p.budget != null && (
                      <div className="portal-project-detail-item">
                        <IconWallet size={14} />
                        <div>
                          <span>Budget</span>
                          <strong>${p.budget.toLocaleString()}</strong>
                        </div>
                      </div>
                    )}
                    {p.contractor && (
                      <div className="portal-project-detail-item">
                        <IconUsers size={14} />
                        <div>
                          <span>Contractor</span>
                          <strong>{p.contractor}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="portal-project-progress-col">
                    <p className="portal-project-col-label">Project Progress</p>
                    <div className="portal-project-progress-big">{p.progressPct}%</div>
                    <div className="portal-progress-bar">
                      <div className="portal-progress-fill" style={{ width: `${p.progressPct}%` }} />
                    </div>
                    {milestones.length > 0 && (
                      <p className="portal-project-task-count">
                        {doneCount} of {milestones.length} milestones completed
                      </p>
                    )}

                    {milestones.length > 0 && (
                      <ul className="portal-milestones-numbered">
                        {milestones.map((m, idx) => {
                          const isCurrent = m.id === firstPendingId;
                          return (
                            <li key={m.id}>
                              <span
                                className={`portal-milestone-num ${m.done ? 'is-done' : isCurrent ? 'is-current' : ''}`}
                              >
                                {m.done ? <IconCheck size={12} /> : idx + 1}
                              </span>
                              <div>
                                <strong>{m.title}</strong>
                                <span>
                                  {m.done
                                    ? `Completed${m.completedAt ? ` on ${new Date(m.completedAt).toLocaleDateString()}` : ''}`
                                    : isCurrent
                                      ? 'In Progress'
                                      : 'Pending'}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {projects && projects.length === 0 && (
          <EmptyState icon={<IconChart size={22} />} title="No building projects right now">
            Maintenance and improvement works appear here with their progress, budget and expected completion,
            so you can follow them from start to finish.
          </EmptyState>
        )}
        {projects && projects.length > 0 && filtered.length === 0 && <p className="portal-empty-note">No projects match this filter.</p>}
      </div>
    </div>
  );
}
