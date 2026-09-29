import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminOverview } from '../api';
import { useAuth } from '../AuthContext';
import { greetingName } from '../names';
import { IconUsers, IconChart, IconBallot, IconClipboard, IconMail, IconTag, IconWallet, IconArrowRight, IconCheck, IconDocument } from '../../components/Icons';
import Photo from '../../components/Photo';

// portal main column: viewport minus the 264 px sidebar and 56 px padding per side (sidebar hidden ≤ 960 px)
const HERO_SIZES = '(max-width: 960px) calc(100vw - 48px), calc(100vw - 376px)';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const INTEREST: Record<string, string> = { buying: 'Buying', renting: 'Renting', tour: 'Tour', other: 'Question' };

function Queue({ title, count, to, empty, children }: { title: string; count: number; to: string; empty: string; children: ReactNode }) {
  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <h2>{title}</h2>
        {count > 0 && <span className="ad-count">{count}</span>}
        <Link to={to} className="ad-link">
          Open <IconArrowRight size={13} />
        </Link>
      </div>
      {count === 0 ? (
        <p className="ad-clear">
          <IconCheck size={15} /> {empty}
        </p>
      ) : (
        <ul className="ad-queue">{children}</ul>
      )}
    </section>
  );
}

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

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const waiting = data ? data.openRequests + data.pendingListings + data.newInquiries : 0;

  return (
    <div className="portal-page">
      <section className="portal-hero">
        <Photo src="/images/shoot/block-b-4.jpg" alt="" sizes={HERO_SIZES} priority />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            {today}
          </p>
          <h1>Welcome back{greetingName(account?.name) ? `, ${greetingName(account?.name)}` : ''}</h1>
          <p className="portal-hero-sub">
            {data ? (waiting > 0 ? `${waiting} ${waiting === 1 ? 'item needs' : 'items need'} your attention` : 'Nothing is waiting for you') : 'Garden View · Building management'}
          </p>
        </div>
      </section>

      {error && <div className="note-card">{error}</div>}

      {data && (
        <>
          <div className="ad-kpis">
            <Link to="/admin/residents" className="ad-kpi">
              <IconUsers size={18} />
              <span>Portal access</span>
              <strong>
                {data.residentAccounts}
                <small> / {data.units} homes</small>
              </strong>
              <span className="ad-bar">
                <span style={{ width: `${data.units ? (data.residentAccounts / data.units) * 100 : 0}%` }} />
              </span>
            </Link>
            <Link to="/admin/charges" className="ad-kpi">
              <IconWallet size={18} />
              <span>Outstanding</span>
              <strong>{usd.format(data.outstanding)}</strong>
              <span className={data.overdueCharges > 0 ? 'ad-kpi-alert' : 'ad-kpi-sub'}>
                {data.overdueCharges > 0 ? `${data.overdueCharges} overdue ${data.overdueCharges === 1 ? 'charge' : 'charges'}` : 'Nothing overdue'}
              </span>
            </Link>
            <Link to="/admin/listings" className="ad-kpi">
              <IconTag size={18} />
              <span>For sale &amp; rent</span>
              <strong>{data.liveListings}</strong>
              <span className="ad-kpi-sub">{data.liveListings === 1 ? 'home live on the website' : 'homes live on the website'}</span>
            </Link>
            <Link to="/admin/projects" className="ad-kpi">
              <IconChart size={18} />
              <span>Active projects</span>
              <strong>{data.activeProjects}</strong>
              <span className="ad-kpi-sub">{data.openVotes} open {data.openVotes === 1 ? 'proposal' : 'proposals'}</span>
            </Link>
          </div>

          <div className="ad-queues">
            <Queue title="New requests" count={data.openRequests} to="/admin/requests" empty="No new requests from residents.">
              {data.latestRequests.map((r) => (
                <li key={r.id}>
                  <Link to="/admin/requests">
                    <IconClipboard size={16} />
                    <span>
                      <strong>
                        {r.category} {r.type === 'RENOVATION' ? 'renovation' : 'issue'}
                      </strong>
                      <span>
                        {r.unit.number} · {ago(r.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </Queue>

            <Queue title="Listings to review" count={data.pendingListings} to="/admin/listings" empty="No listings waiting for review.">
              {data.latestListings.map((l) => (
                <li key={l.id}>
                  <Link to="/admin/listings">
                    <IconTag size={16} />
                    <span>
                      <strong>
                        {l.unit.number} {l.type === 'SALE' ? 'for sale' : 'for rent'}
                        {l.askingPrice != null ? ` · ${usd.format(l.askingPrice)}${l.type === 'RENT' ? '/mo' : ''}` : ''}
                      </strong>
                      <span>
                        {l.photoCount} {l.photoCount === 1 ? 'photo' : 'photos'} · {ago(l.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </Queue>

            <Queue title="Website enquiries" count={data.newInquiries} to="/admin/inquiries" empty="No new enquiries from the website.">
              {data.latestInquiries.map((q) => (
                <li key={q.id}>
                  <Link to="/admin/inquiries">
                    <IconMail size={16} />
                    <span>
                      <strong>{q.name}</strong>
                      <span>
                        {q.interest ? `${INTEREST[q.interest] ?? q.interest} · ` : ''}
                        {ago(q.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </Queue>

            <Queue title="Open proposals" count={data.openVotes} to="/admin/votes" empty="No proposals open for voting.">
              {data.closingVotes.map((v) => (
                <li key={v.id}>
                  <Link to="/admin/votes">
                    <IconBallot size={16} />
                    <span>
                      <strong>{v.title}</strong>
                      <span>
                        {v.responses} of {data.units} homes voted · closes {new Date(v.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </Queue>
          </div>

          <nav className="ad-shortcuts" aria-label="Shortcuts">
            <Link to="/admin/charges">
              <IconWallet size={16} /> Issue charges
            </Link>
            <Link to="/admin/votes">
              <IconBallot size={16} /> New proposal
            </Link>
            <Link to="/admin/documents">
              <IconDocument size={16} /> Publish a document
            </Link>
            <Link to="/admin/residents">
              <IconUsers size={16} /> Give an owner access
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}
