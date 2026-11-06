import { useEffect, useMemo, useState } from 'react';
import { api, type Project } from '../api';
import { usd, shortDate } from '../format';
import PageHeader from '../PageHeader';
import CircularProgress from '../CircularProgress';
import Photo from '../../components/Photo';
import { IconCalendar, IconCheck, IconWallet, IconUsers, IconChart } from '../../components/Icons';

const PROJECT_IMAGES = [
  '/images/shoot/common-7.jpg',
  '/images/shoot/common-8.jpg',
  '/images/shoot/common-5.jpg',
  '/images/shoot/block-c-4.jpg',
];
const MEDIA_SIZES = '(max-width: 780px) calc(100vw - 40px), 300px';
const FILTERS = ['All', 'Planning', 'In progress', 'Complete'] as const;
type Filter = (typeof FILTERS)[number];

function statusOf(project: Project): Filter {
  if (project.progressPct >= 100) return 'Complete';
  if (project.progressPct <= 0) return 'Planning';
  return 'In progress';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');

  useEffect(() => {
    api
      .get<{ projects: Project[] }>('/resident/projects')
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const list = projects ?? [];
    if (filter === 'All') return list;
    return list.filter((project) => statusOf(project) === filter);
  }, [projects, filter]);

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Project progress"
        title="Building projects"
        lede="Maintenance and improvement works across Garden View — what is planned, what is underway, and when it finishes."
      />

      {error && (
        <div className="rs-note">
          <IconChart size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="rs-chip-row" role="group" aria-label="Filter projects">
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

      <div className="rs-project-list" style={{ marginTop: 18 }}>
        {filtered.map((project, index) => {
          const milestones = project.milestones ?? [];
          const done = milestones.filter((milestone) => milestone.done).length;
          const currentId = milestones.find((milestone) => !milestone.done)?.id;

          return (
            <article key={project.id} className="rs-project">
              <div className="rs-project-media">
                <Photo
                  src={PROJECT_IMAGES[index % PROJECT_IMAGES.length]}
                  alt=""
                  sizes={MEDIA_SIZES}
                  eager={index < 2}
                />
                <span className="rs-project-badge">{statusOf(project)}</span>
                <span className="rs-project-ring">
                  <CircularProgress percent={project.progressPct} size={50} stroke={4} />
                </span>
                <div className="rs-project-media-text">
                  <p>{project.category}</p>
                  <h3>{project.title}</h3>
                </div>
              </div>

              <div className="rs-project-body">
                {project.description && <p className="rs-project-desc">{project.description}</p>}

                <div className="rs-progress">
                  <div className="rs-progress-label">
                    <span>Progress</span>
                    <strong>{project.progressPct}%</strong>
                  </div>
                  <div className="rs-progress-bar">
                    <div className="rs-progress-fill" style={{ width: `${project.progressPct}%` }} />
                  </div>
                </div>

                <div className="rs-project-meta">
                  <div className="rs-meta-item">
                    <IconCalendar size={15} />
                    <div>
                      <span>Started</span>
                      <strong>{project.startDate ? shortDate(project.startDate) : 'Not yet'}</strong>
                    </div>
                  </div>
                  <div className="rs-meta-item">
                    <IconCalendar size={15} />
                    <div>
                      <span>Expected completion</span>
                      <strong>{project.eta ? shortDate(project.eta) : 'To be confirmed'}</strong>
                    </div>
                  </div>
                  {project.budget != null && (
                    <div className="rs-meta-item">
                      <IconWallet size={15} />
                      <div>
                        <span>Budget</span>
                        <strong>{usd.format(project.budget)}</strong>
                      </div>
                    </div>
                  )}
                  {project.contractor && (
                    <div className="rs-meta-item">
                      <IconUsers size={15} />
                      <div>
                        <span>Contractor</span>
                        <strong>{project.contractor}</strong>
                      </div>
                    </div>
                  )}
                </div>

                {milestones.length > 0 && (
                  <ol className="rs-milestones" aria-label="Milestones">
                    {milestones.map((milestone, milestoneIndex) => (
                      <li
                        key={milestone.id}
                        className={`rs-milestone${milestone.done ? ' is-done' : milestone.id === currentId ? ' is-current' : ''}`}
                      >
                        <span className="rs-milestone-dot">
                          {milestone.done ? <IconCheck size={11} /> : milestoneIndex + 1}
                        </span>
                        <div>
                          <strong>{milestone.title}</strong>
                          <span>
                            {milestone.done
                              ? `Completed${milestone.completedAt ? ` ${shortDate(milestone.completedAt)}` : ''}`
                              : milestone.id === currentId
                                ? 'In progress'
                                : 'Pending'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {milestones.length > 0 && (
                  <p className="rs-vote-meta" style={{ marginTop: 10 }}>
                    {done} of {milestones.length} milestones complete
                  </p>
                )}
              </div>
            </article>
          );
        })}

        {!projects && !error && (
          <div className="rs-note">
            <IconChart size={15} />
            <span>Loading projects…</span>
          </div>
        )}

        {projects && projects.length === 0 && (
          <div className="rs-empty">
            <span className="rs-empty-icon">
              <IconChart size={20} />
            </span>
            <h2>No building projects right now</h2>
            <p>
              Maintenance and improvement works appear here with their progress, budget and expected
              completion, so you can follow them from start to finish.
            </p>
          </div>
        )}

        {projects && projects.length > 0 && filtered.length === 0 && (
          <div className="rs-empty">
            <p>No projects in this view.</p>
          </div>
        )}
      </div>
    </div>
  );
}
