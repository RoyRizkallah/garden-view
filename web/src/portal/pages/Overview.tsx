import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Overview as OverviewData } from '../api';
import { useAuth } from '../AuthContext';
import CircularProgress from '../CircularProgress';
import Photo from '../../components/Photo';
import {
  IconWallet,
  IconBallot,
  IconClipboard,
  IconDocument,
  IconArrowRight,
  IconCalendar,
} from '../../components/Icons';

// portal main column: viewport minus the 264 px sidebar and 56 px padding per side (sidebar hidden ≤ 960 px)
const HERO_SIZES = '(max-width: 960px) calc(100vw - 48px), calc(100vw - 376px)';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Overview() {
  const { account } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OverviewData>('/resident/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const featured = data?.recentProjects[0];
  const rest = data?.recentProjects.slice(1) ?? [];

  return (
    <div className="portal-page">
      <section className="portal-hero">
        <Photo src="/images/shoot/common-3.jpg" alt="" sizes={HERO_SIZES} priority />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            <IconCalendar size={14} />
            {today}
          </p>
          <h1>
            {greeting()}, {account?.name?.split(' ')[0]}
          </h1>
          {account?.unit && (
            <p className="portal-hero-sub">
              Garden View · Unit {account.unit.block}-{account.unit.number}
            </p>
          )}
        </div>
      </section>

      {error && <div className="note-card" style={{ marginTop: 24 }}>{error}</div>}

      {data && (
        <>
          <div className="portal-stat-grid">
            <Link to="/portal/charges" className="portal-stat-card">
              <span className="portal-stat-icon">
                <IconWallet size={20} />
              </span>
              <span className="portal-stat-label">Balance Due</span>
              <span className="portal-stat-value">${data.balance.toFixed(2)}</span>
              <span className="portal-stat-link">View charges →</span>
            </Link>
            <Link to="/portal/voting" className="portal-stat-card">
              <span className="portal-stat-icon">
                <IconBallot size={20} />
              </span>
              <span className="portal-stat-label">Open Votes</span>
              <span className="portal-stat-value">{data.openVotesCount}</span>
              <span className="portal-stat-link">Cast your vote →</span>
            </Link>
            <Link to="/portal/requests" className="portal-stat-card">
              <span className="portal-stat-icon">
                <IconClipboard size={20} />
              </span>
              <span className="portal-stat-label">Active Requests</span>
              <span className="portal-stat-value">{data.activeRequestsCount}</span>
              <span className="portal-stat-link">View requests →</span>
            </Link>
          </div>

          <div className="portal-bento">
            {featured && (
              <Link to="/portal/projects" className="portal-feature-card">
                <div className="portal-feature-top">
                  <div className="portal-feature-info">
                    <span className="portal-feature-badge">{featured.category}</span>
                    <h2>{featured.title}</h2>
                    {featured.description && <p>{featured.description}</p>}
                    <div className="portal-feature-progress-row">
                      <span>Project Progress</span>
                      <span className="portal-feature-progress-pct">{featured.progressPct}%</span>
                    </div>
                    <div className="portal-progress-bar">
                      <div className="portal-progress-fill" style={{ width: `${featured.progressPct}%` }} />
                    </div>
                  </div>
                  <div className="portal-feature-media">
                    <Photo src="/images/shoot/block-a-6.jpg" alt="" sizes="108px" />
                    <span className="portal-feature-ring">
                      <CircularProgress percent={featured.progressPct} size={54} stroke={4} />
                    </span>
                  </div>
                </div>
                <div className="portal-feature-eta-row">
                  <span>
                    <IconCalendar size={14} /> Estimated completion
                  </span>
                  <strong>{featured.eta ? new Date(featured.eta).toLocaleDateString() : 'TBD'}</strong>
                </div>
                <span className="portal-feature-cta">
                  View project details <IconArrowRight size={14} />
                </span>
              </Link>
            )}

            <div className="portal-bento-side">
              <Link to="/portal/requests" className="portal-bento-action">
                <span className="portal-bento-action-icon">
                  <IconClipboard size={20} />
                </span>
                <div>
                  <strong>Submit a Request</strong>
                  <span>Report an issue or plan a renovation</span>
                </div>
                <IconArrowRight size={16} className="portal-bento-action-arrow" />
              </Link>
              <Link to="/portal/voting" className="portal-bento-action">
                <span className="portal-bento-action-icon">
                  <IconBallot size={20} />
                </span>
                <div>
                  <strong>Building Proposals</strong>
                  <span>Have your say — one vote per unit</span>
                </div>
                <IconArrowRight size={16} className="portal-bento-action-arrow" />
              </Link>
              <Link to="/portal/documents" className="portal-bento-action">
                <span className="portal-bento-action-icon">
                  <IconDocument size={20} />
                </span>
                <div>
                  <strong>Building Documents</strong>
                  <span>Bylaws, safety guidelines, financials</span>
                </div>
                <IconArrowRight size={16} className="portal-bento-action-arrow" />
              </Link>
            </div>
          </div>

          {rest.length > 0 && (
            <>
              <div className="portal-section-head">
                <h2>More Projects</h2>
                <Link to="/portal/projects" className="portal-stat-link">
                  View all →
                </Link>
              </div>
              <div className="portal-project-list">
                {rest.map((p) => (
                  <Link to="/portal/projects" key={p.id} className="portal-project-row">
                    <CircularProgress percent={p.progressPct} size={52} stroke={5} />
                    <div className="portal-project-row-body">
                      <strong>{p.title}</strong>
                      <span>{p.category}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
