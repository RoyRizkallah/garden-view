import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl, type Overview as OverviewData } from '../api';
import { useAuth } from '../AuthContext';
import { greetingName } from '../names';
import CircularProgress from '../CircularProgress';
import Photo from '../../components/Photo';
import { matchResidence } from '../../data/useUnitPlan';
import { UNIT_KIND_LABEL } from '../../data/buildingExplorer';
import { formatSqm, useUnitArea } from '../../data/planAreas';
import { floorsLabel } from '../../data/listings';
import {
  IconWallet,
  IconBallot,
  IconClipboard,
  IconDocument,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconLayers,
  IconTag,
  IconHome,
} from '../../components/Icons';
import '../../styles/portal-home.css';

// portal main column: viewport minus the 264 px sidebar and 56 px padding per side (sidebar hidden ≤ 960 px)
const HERO_SIZES = '(max-width: 960px) calc(100vw - 48px), calc(100vw - 376px)';
// each block's own facade, from the professional shoot
const BLOCK_PHOTO: Record<string, string> = {
  A: '/images/shoot/block-a-2.jpg',
  B: '/images/shoot/block-b-2.jpg',
  C: '/images/shoot/block-c-1.jpg',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
/** "2026-10" -> "October 2026" */
const periodLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : period;
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Closes today", "Closes tomorrow", "Closes in 5 days", "Closed". */
function closesIn(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return `Closes in ${days} days`;
}

const REQUEST_STATUS = { OPEN: 'Received', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' } as const;
const LISTING_STATUS = { PENDING: 'Waiting for review', REVIEWING: 'Under review', APPROVED: 'Live on the website' } as const;

type Item = { key: string; icon: ReactNode; title: string; meta: string; to: string; tone?: 'alert' | 'gold' };

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

  const residence = useMemo(() => matchResidence(account?.unit?.block, account?.unit?.number), [account?.unit?.block, account?.unit?.number]);
  const area = useUnitArea(residence);
  const block = account?.unit?.block ?? residence?.block ?? 'A';
  const name = greetingName(account?.name);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  // what needs the resident, most pressing first
  const items: Item[] = [];
  if (data) {
    if (data.balance > 0.004) {
      items.push({
        key: 'balance',
        icon: <IconWallet size={18} />,
        title: `${usd.format(data.balance)} to pay`,
        meta:
          data.overdueCount > 0
            ? `${data.overdueCount} ${data.overdueCount === 1 ? 'charge is' : 'charges are'} overdue`
            : data.nextCharge
              ? `${periodLabel(data.nextCharge.period)} · due ${shortDate(data.nextCharge.dueDate)}`
              : 'See your charges',
        to: '/portal/charges',
        tone: data.overdueCount > 0 ? 'alert' : undefined,
      });
    }
    for (const v of data.awaitingVotes) {
      items.push({ key: `vote-${v.id}`, icon: <IconBallot size={18} />, title: v.title, meta: `Your vote is needed · ${closesIn(v.closesAt)}`, to: '/portal/voting', tone: 'gold' });
    }
    if (data.awaitingVotesCount > data.awaitingVotes.length) {
      const more = data.awaitingVotesCount - data.awaitingVotes.length;
      items.push({ key: 'votes-more', icon: <IconBallot size={18} />, title: `${more} more ${more === 1 ? 'proposal' : 'proposals'} to vote on`, meta: 'Building proposals', to: '/portal/voting' });
    }
    for (const r of data.activeRequests) {
      items.push({
        key: `req-${r.id}`,
        icon: <IconClipboard size={18} />,
        title: `${r.category} ${r.type === 'RENOVATION' ? 'renovation' : 'request'}`,
        meta: `${REQUEST_STATUS[r.status]} · updated ${shortDate(r.updatedAt)}`,
        to: '/portal/requests',
      });
    }
    if (data.listing) {
      items.push({
        key: 'listing',
        icon: <IconTag size={18} />,
        title: `Your home ${data.listing.type === 'SALE' ? 'for sale' : 'for rent'}`,
        meta: LISTING_STATUS[data.listing.status],
        to: '/portal/residence#list-your-home',
        tone: data.listing.status === 'APPROVED' ? 'gold' : undefined,
      });
    }
  }

  return (
    <div className="portal-page">
      <section className="portal-hero ph-hero">
        <Photo src={BLOCK_PHOTO[block] ?? BLOCK_PHOTO.A} alt="" sizes={HERO_SIZES} priority />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            <IconCalendar size={14} />
            {today}
          </p>
          <h1>
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="portal-hero-sub">
            {residence ? `Residence ${residence.apartment} · Block ${residence.block} · ${floorsLabel(residence.floors)}` : account?.unit ? `Unit ${account.unit.block}-${account.unit.number}` : 'Garden View'}
          </p>
        </div>
      </section>

      {error && <div className="note-card" style={{ marginTop: 24 }}>{error}</div>}

      <div className="ph-grid">
        <section className="ph-card ph-home" aria-labelledby="ph-home-title">
          <p className="ph-kicker">
            <IconHome size={14} /> Your home
          </p>
          <h2 id="ph-home-title" className="ph-code">
            {residence?.apartment ?? account?.unit?.number ?? '—'}
          </h2>
          {residence && <p className="ph-sub">{UNIT_KIND_LABEL[residence.kind].split(' · ')[0]}</p>}
          <dl className="ph-facts">
            <div>
              <dt>Block</dt>
              <dd>{block}</dd>
            </div>
            {residence && (
              <div>
                <dt>{residence.floors.length > 1 ? 'Floors' : 'Floor'}</dt>
                <dd>{residence.floors.map((f) => (f === 0 ? 'G' : f)).join(' & ')}</dd>
              </div>
            )}
            {area?.complete && area.netSqm !== undefined && (
              <div>
                <dt>Interior</dt>
                <dd>{formatSqm(area.netSqm)}</dd>
              </div>
            )}
            {area?.complete && !!area.outdoorSqm && (
              <div>
                <dt>Balconies</dt>
                <dd>{formatSqm(area.outdoorSqm)}</dd>
              </div>
            )}
          </dl>
          <div className="ph-home-links">
            <Link to="/portal/residence" className="btn btn-gold btn-sm">
              <IconLayers size={14} /> Your 3D floor plan
            </Link>
            <Link to="/portal/residence#list-your-home" className="ph-link">
              Sell or rent <IconArrowRight size={13} />
            </Link>
          </div>
        </section>

        <section className="ph-card ph-attention" aria-labelledby="ph-att-title">
          <div className="ph-card-head">
            <h2 id="ph-att-title">For you</h2>
            {data && items.length > 0 && <span className="ph-count">{items.length}</span>}
          </div>
          {!data && !error && <div className="ph-skeleton" aria-busy="true" />}
          {data && items.length === 0 && (
            <div className="ph-clear">
              <span className="ph-clear-icon">
                <IconCheck size={20} />
              </span>
              <div>
                <strong>You're all caught up</strong>
                <p>Nothing to pay, no proposals waiting for your vote, and no open requests.</p>
              </div>
            </div>
          )}
          {items.length > 0 && (
            <ul className="ph-list">
              {items.map((i) => (
                <li key={i.key}>
                  <Link to={i.to} className={`ph-item${i.tone ? ` is-${i.tone}` : ''}`}>
                    <span className="ph-item-icon">{i.icon}</span>
                    <span className="ph-item-text">
                      <strong>{i.title}</strong>
                      <span>{i.meta}</span>
                    </span>
                    <IconArrowRight size={15} className="ph-item-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data && (data.recentProjects.length > 0 || data.latestDocuments.length > 0) && (
        <div className="ph-grid ph-grid-even">
          {data.recentProjects.length > 0 && (
            <section className="ph-card">
              <div className="ph-card-head">
                <h2>Building projects</h2>
                <Link to="/portal/projects" className="ph-link">
                  All projects <IconArrowRight size={13} />
                </Link>
              </div>
              <ul className="ph-projects">
                {data.recentProjects.map((p) => (
                  <li key={p.id}>
                    <CircularProgress percent={p.progressPct} size={46} stroke={4} />
                    <div>
                      <strong>{p.title}</strong>
                      <span>
                        {p.category}
                        {p.eta ? ` · expected ${new Date(p.eta).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.latestDocuments.length > 0 && (
            <section className="ph-card">
              <div className="ph-card-head">
                <h2>Latest documents</h2>
                <Link to="/portal/documents" className="ph-link">
                  All documents <IconArrowRight size={13} />
                </Link>
              </div>
              <ul className="ph-docs">
                {data.latestDocuments.map((d) => (
                  <li key={d.id}>
                    <a href={mediaUrl(d.fileUrl)} target="_blank" rel="noreferrer">
                      <IconDocument size={18} />
                      <span>
                        <strong>{d.title}</strong>
                        <span>
                          {d.category} · {shortDate(d.createdAt)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <nav className="ph-actions" aria-label="Quick actions">
        <Link to="/portal/requests">
          <IconClipboard size={18} />
          <span>
            <strong>Report a problem</strong>
            <span>Or plan a renovation</span>
          </span>
        </Link>
        <Link to="/portal/voting">
          <IconBallot size={18} />
          <span>
            <strong>Proposals</strong>
            <span>One vote per home</span>
          </span>
        </Link>
        <Link to="/portal/documents">
          <IconDocument size={18} />
          <span>
            <strong>Documents</strong>
            <span>Bylaws, minutes, financials</span>
          </span>
        </Link>
      </nav>
    </div>
  );
}
