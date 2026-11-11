import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, currentInstallment, type HomeCharges, type Overview as OverviewData } from '../api';
import { useAuth } from '../AuthContext';
import { greetingName } from '../names';
import { usd, shortDate, dayMonth, monthYear, closesIn } from '../format';
import BuildingElevation from '../BuildingElevation';
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
  IconCalendar,
  IconPieChart,
  IconArrowRight,
  IconCheck,
  IconLayers,
  IconTag,
} from '../../components/Icons';

const BLOCK_PHOTO: Record<string, string> = {
  A: '/images/shoot/block-a-2.jpg',
  B: '/images/shoot/block-b-2.jpg',
  C: '/images/shoot/block-c-1.jpg',
};

const REQUEST_STATUS = { OPEN: 'Received', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' } as const;
const LISTING_STATUS = {
  PENDING: 'Waiting for review',
  REVIEWING: 'Under review',
  APPROVED: 'Live on the website',
} as const;

type Item = { key: string; icon: ReactNode; title: string; meta: string; to: string; tone?: 'alert' | 'gold' };

export default function Overview() {
  const { account } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the home's maintenance for the year (undefined while loading, null when not published)
  const [homeCharges, setHomeCharges] = useState<HomeCharges | null | undefined>(undefined);
  const thisHalf = currentInstallment(homeCharges);

  useEffect(() => {
    api
      .get<OverviewData>('/resident/overview')
      .then(setData)
      .catch((err) => setError(err.message));
    api
      .get<{ charges: HomeCharges | null }>('/resident/installments')
      .then((res) => setHomeCharges(res.charges))
      .catch(() => setHomeCharges(null));
  }, []);

  const residence = useMemo(
    () => matchResidence(account?.unit?.block, account?.unit?.number),
    [account?.unit?.block, account?.unit?.number],
  );
  const area = useUnitArea(residence);
  const block = account?.unit?.block ?? residence?.block ?? 'A';
  const name = greetingName(account?.name);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const balance = data?.balance ?? 0;
  const overdue = data?.overdueCount ?? 0;
  const next = data?.nextCharge ?? null;
  const awaiting = data?.awaitingVotesCount ?? 0;

  const items: Item[] = [];
  if (data) {
    if (balance > 0.004) {
      items.push({
        key: 'balance',
        icon: <IconWallet size={18} />,
        title: `${usd.format(balance)} outstanding`,
        meta:
          overdue > 0
            ? `${overdue} ${overdue === 1 ? 'charge is' : 'charges are'} overdue`
            : next
              ? `${monthYear(next.period)} · due ${dayMonth(next.dueDate)}`
              : 'View your statement',
        to: '/portal/charges',
        tone: overdue > 0 ? 'alert' : undefined,
      });
    }

    for (const vote of data.awaitingVotes) {
      items.push({
        key: `vote-${vote.id}`,
        icon: <IconBallot size={18} />,
        title: vote.title,
        meta: `Your vote is needed · ${closesIn(vote.closesAt)}`,
        to: '/portal/voting',
        tone: 'gold',
      });
    }

    if (data.awaitingVotesCount > data.awaitingVotes.length) {
      const more = data.awaitingVotesCount - data.awaitingVotes.length;
      items.push({
        key: 'votes-more',
        icon: <IconBallot size={18} />,
        title: `${more} more ${more === 1 ? 'proposal' : 'proposals'} to vote on`,
        meta: 'Building proposals',
        to: '/portal/voting',
      });
    }

    for (const request of data.activeRequests) {
      items.push({
        key: `request-${request.id}`,
        icon: <IconClipboard size={18} />,
        title: `${request.category} ${request.type === 'RENOVATION' ? 'renovation' : 'request'}`,
        meta: `${REQUEST_STATUS[request.status]} · updated ${dayMonth(request.updatedAt)}`,
        to: '/portal/requests',
      });
    }

    if (data.listing) {
      items.push({
        key: 'listing',
        icon: <IconTag size={18} />,
        title: `Your home ${data.listing.type === 'SALE' ? 'for sale' : 'for rent'}`,
        meta: LISTING_STATUS[data.listing.status],
        to: '/portal/sell-rent',
        tone: data.listing.status === 'APPROVED' ? 'gold' : undefined,
      });
    }
  }

  const homeLabel = residence?.apartment ?? account?.unit?.number ?? '';
  const homeFloors = residence?.floors ?? [];
  const blockPhoto = BLOCK_PHOTO[block] ?? BLOCK_PHOTO.A;

  return (
    <div className="rs-page rs-overview rs-home-v2">
      {/* the opening: who and where, beside the building with this home lit */}
      <section className="rs-welcome">
        <div className="rs-welcome-text">
          <p className="rs-hero-date">
            <IconCalendar size={14} />
            {today}
          </p>
          <h1>
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="rs-welcome-sub">
            {residence
              ? `Residence ${residence.apartment} · Block ${residence.block} · ${floorsLabel(residence.floors)}`
              : account?.unit
                ? `Block ${account.unit.block} · ${account.unit.number}`
                : 'Garden View'}
          </p>
          <div className="rs-welcome-actions">
            <Link to="/portal/residence" className="rs-btn rs-btn-gold">
              <IconLayers size={15} /> Your 3D floor plan
            </Link>
            <Link to="/portal/requests" className="rs-btn rs-btn-ghost-light">
              <IconClipboard size={15} /> Report a problem
            </Link>
          </div>
        </div>
        {homeLabel && <BuildingElevation block={block} floors={homeFloors} label={homeLabel} />}
      </section>

      {/* the account in one line: three figures, each opening its page */}
      <div className="rs-ledger">
        <Link to="/portal/charges" className="rs-ledger-item">
          <span className="rs-ledger-label">Maintenance {homeCharges?.year ?? new Date().getFullYear()}</span>
          <span className="rs-ledger-value">{homeCharges ? usd.format(homeCharges.total) : '—'}</span>
          <span className="rs-ledger-note">
            {homeCharges
              ? `Your share: ${homeCharges.sharePerThousand} / 1000`
              : homeCharges === null
                ? 'Not published yet'
                : 'Loading'}
          </span>
        </Link>
        <Link to="/portal/charges" className="rs-ledger-item">
          <span className="rs-ledger-label">This half</span>
          <span className="rs-ledger-value">{thisHalf ? usd.format(thisHalf.amount) : '—'}</span>
          <span className="rs-ledger-note">
            {thisHalf
              ? `${thisHalf.label} · ${dayMonth(thisHalf.from)} – ${dayMonth(thisHalf.to)}`
              : 'No installment this half'}
          </span>
        </Link>
        <Link to="/portal/voting" className="rs-ledger-item">
          <span className="rs-ledger-label">Open proposals</span>
          <span className="rs-ledger-value">{data ? data.openVotesCount : '—'}</span>
          <span className="rs-ledger-note">
            {awaiting > 0 ? `${awaiting} waiting for your vote` : data ? 'Nothing waiting for you' : 'Loading'}
          </span>
        </Link>
        <Link to="/portal/charges" className="rs-ledger-link">
          Your charges <IconArrowRight size={14} />
        </Link>
      </div>

      {error && (
        <div className="rs-note" style={{ marginTop: 20 }}>
          <IconDocument size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="rs-home-columns">
        <div className="rs-home-main">
          <section className="rs-card rs-attention" aria-labelledby="for-you">
            <div className="rs-card-head">
              <h2 id="for-you">Needs your attention</h2>
              {data && items.length > 0 && <span className="rs-count">{items.length}</span>}
            </div>

            {!data && !error && (
              <div className="rs-empty" aria-busy="true">
                <p>Reading your account…</p>
              </div>
            )}

            {data && items.length === 0 && (
              <div className="rs-clear">
                <span className="rs-clear-icon">
                  <IconCheck size={20} />
                </span>
                <div>
                  <strong>You&rsquo;re all caught up</strong>
                  <p>No proposals waiting for your vote, and no open requests.</p>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="rs-actions">
                {items.map((item) => (
                  <Link key={item.key} to={item.to} className={`rs-action${item.tone ? ` is-${item.tone}` : ''}`}>
                    <span className="rs-action-icon">{item.icon}</span>
                    <span className="rs-action-text">
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </span>
                    <IconArrowRight size={15} className="rs-action-arrow" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {data && data.recentProjects.length > 0 && (
            <section className="rs-card" aria-labelledby="projects">
              <div className="rs-card-head">
                <h2 id="projects">Works in the building</h2>
                <Link to="/portal/projects" className="rs-textlink">
                  All projects <IconArrowRight size={12} />
                </Link>
              </div>
              <div className="rs-works">
                {data.recentProjects.map((project) => (
                  <Link key={project.id} to="/portal/projects" className="rs-work">
                    <span className="rs-work-head">
                      <strong>{project.title}</strong>
                      <span className="rs-work-pct">{project.progressPct}%</span>
                    </span>
                    <span className="rs-work-bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, Math.max(0, project.progressPct))}%` }} />
                    </span>
                    <span className="rs-work-meta">
                      {project.category}
                      {project.eta
                        ? ` · expected ${new Date(project.eta).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                        : ''}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="rs-home-side">
          <section className="rs-card rs-home-card" aria-labelledby="your-home">
            <div className="rs-home-photo">
              <Photo src={blockPhoto} alt={`Block ${block} of Garden View`} sizes="(max-width: 1080px) 100vw, 380px" />
              <span className="rs-home-photo-tag">Block {block}</span>
            </div>
            <div className="rs-home-body">
              <h2 id="your-home">Your home</h2>
              <p className="rs-home-code">{residence?.apartment ?? account?.unit?.number ?? '—'}</p>
              {residence && <p className="rs-home-sub">{UNIT_KIND_LABEL[residence.kind].split(' · ')[0]}</p>}
              <dl className="rs-facts">
                {residence && (
                  <div>
                    <dt>{residence.floors.length > 1 ? 'Floors' : 'Floor'}</dt>
                    <dd>{residence.floors.map((floor) => (floor === 0 ? 'G' : floor)).join(' & ')}</dd>
                  </div>
                )}
                {area?.complete && area.netSqm !== undefined && (
                  <div>
                    <dt>Interior</dt>
                    <dd>{formatSqm(area.netSqm)}</dd>
                  </div>
                )}
                {area?.complete && area.outdoorSqm ? (
                  <div>
                    <dt>Outdoor</dt>
                    <dd>{formatSqm(area.outdoorSqm)}</dd>
                  </div>
                ) : null}
              </dl>
              <Link to="/portal/sell-rent" className="rs-textlink">
                Sell or rent your home <IconArrowRight size={13} />
              </Link>
            </div>
          </section>

          {data && data.latestDocuments.length > 0 && (
            <section className="rs-card" aria-labelledby="documents">
              <div className="rs-card-head">
                <h2 id="documents">Latest documents</h2>
                <Link to="/portal/documents" className="rs-textlink">
                  All <IconArrowRight size={12} />
                </Link>
              </div>
              <div className="rs-rows">
                {data.latestDocuments.map((document) => (
                  <Link key={document.id} to="/portal/documents" className="rs-doc-row">
                    <IconDocument size={18} />
                    <div>
                      <strong>{document.title}</strong>
                      <span>
                        {document.category} · {shortDate(document.createdAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <nav className="rs-quick" aria-label="Shortcuts">
        <Link to="/portal/requests">
          <span className="rs-quick-icon">
            <IconClipboard size={17} />
          </span>
          <span>
            <strong>Report a problem</strong>
            <span>Or plan a renovation</span>
          </span>
        </Link>
        <Link to="/portal/budget">
          <span className="rs-quick-icon">
            <IconPieChart size={17} />
          </span>
          <span>
            <strong>Budget</strong>
            <span>Where the maintenance goes</span>
          </span>
        </Link>
        <Link to="/portal/meetings">
          <span className="rs-quick-icon">
            <IconCalendar size={17} />
          </span>
          <span>
            <strong>Meetings</strong>
            <span>Agendas and minutes</span>
          </span>
        </Link>
        <Link to="/portal/documents">
          <span className="rs-quick-icon">
            <IconDocument size={17} />
          </span>
          <span>
            <strong>Documents</strong>
            <span>Letters, updates and budget</span>
          </span>
        </Link>
      </nav>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
