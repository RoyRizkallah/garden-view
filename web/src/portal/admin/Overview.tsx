import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminOverview } from '../api';
import { useAuth } from '../AuthContext';
import { IconUsers, IconChart, IconBallot, IconClipboard, IconMail } from '../../components/Icons';
import Photo from '../../components/Photo';

// portal main column: viewport minus the 264 px sidebar and 56 px padding per side (sidebar hidden ≤ 960 px)
const HERO_SIZES = '(max-width: 960px) calc(100vw - 48px), calc(100vw - 376px)';

export default function AdminOverviewPage() {
  const { account } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminOverview>('/admin/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="portal-page">
      <section className="portal-hero">
        <Photo src="/images/exterior-09.jpg" alt="" sizes={HERO_SIZES} priority />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            {today}
          </p>
          <h1>Welcome back, {account?.name?.split(' ')[0]}</h1>
          <p className="portal-hero-sub">Garden View · Administrator</p>
        </div>
      </section>

      {error && <div className="note-card" style={{ marginTop: 24 }}>{error}</div>}

      {data && (
        <div className="portal-stat-grid portal-stat-grid-5">
          <Link to="/admin/residents" className="portal-stat-card">
            <span className="portal-stat-icon">
              <IconUsers size={20} />
            </span>
            <span className="portal-stat-label">Units</span>
            <span className="portal-stat-value">{data.units}</span>
            <span className="portal-stat-link">View residents →</span>
          </Link>
          <Link to="/admin/projects" className="portal-stat-card">
            <span className="portal-stat-icon">
              <IconChart size={20} />
            </span>
            <span className="portal-stat-label">Active Projects</span>
            <span className="portal-stat-value">{data.activeProjects}</span>
            <span className="portal-stat-link">Manage projects →</span>
          </Link>
          <Link to="/admin/votes" className="portal-stat-card">
            <span className="portal-stat-icon">
              <IconBallot size={20} />
            </span>
            <span className="portal-stat-label">Open Votes</span>
            <span className="portal-stat-value">{data.openVotes}</span>
            <span className="portal-stat-link">Manage votes →</span>
          </Link>
          <Link to="/admin/requests" className="portal-stat-card">
            <span className="portal-stat-icon">
              <IconClipboard size={20} />
            </span>
            <span className="portal-stat-label">Open Requests</span>
            <span className="portal-stat-value">{data.openRequests}</span>
            <span className="portal-stat-link">View requests →</span>
          </Link>
          <Link to="/admin/inquiries" className="portal-stat-card">
            <span className="portal-stat-icon">
              <IconMail size={20} />
            </span>
            <span className="portal-stat-label">New Inquiries</span>
            <span className="portal-stat-value">{data.newInquiries}</span>
            <span className="portal-stat-link">View inquiries →</span>
          </Link>
        </div>
      )}
    </div>
  );
}
