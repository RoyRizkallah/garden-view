import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { initials } from './names';
import {
  IconHome,
  IconWallet,
  IconChart,
  IconBallot,
  IconClipboard,
  IconBuilding,
  IconDocument,
  IconTag,
  IconUser,
  IconLogout,
  IconChevronRight,
  IconCalendar,
  IconUsers,
  IconWrench,
  IconMenu,
  IconLeaf,
  IconClock,
  IconPieChart,
} from '../components/Icons';

type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: typeof IconHome;
  end?: boolean;
  primary?: boolean;
  /** the section's own pages, listed under it */
  children?: NavItem[];
};

const GROUPS: { label: string; links: NavItem[] }[] = [
  {
    label: 'Home',
    links: [{ to: '/portal', label: 'Overview', icon: IconHome, end: true, primary: true }],
  },
  {
    label: 'Your home',
    links: [
      { to: '/portal/residence', label: 'My Residence', icon: IconBuilding },
      { to: '/portal/services', label: 'Home Services', short: 'Services', icon: IconWrench, primary: true },
      { to: '/portal/requests', label: 'Requests', icon: IconClipboard, primary: true },
      { to: '/portal/sell-rent', label: 'Sell & Rent', icon: IconTag },
    ],
  },
  {
    label: 'The building',
    links: [
      { to: '/portal/charges', label: 'Charges', icon: IconWallet, primary: true },
      { to: '/portal/budget', label: 'Budget', icon: IconPieChart },
      { to: '/portal/projects', label: 'Project Progress', icon: IconChart },
      { to: '/portal/voting', label: 'Voting', icon: IconBallot },
      { to: '/portal/meetings', label: 'Meetings', icon: IconCalendar },
      {
        to: '/portal/people',
        label: 'Our People',
        icon: IconUsers,
        children: [
          { to: '/portal/people', label: 'Garden Tree', icon: IconLeaf, end: true },
          { to: '/portal/people/schedule', label: 'Schedule', icon: IconClock, end: true },
        ],
      },
      { to: '/portal/documents', label: 'Documents', icon: IconDocument },
    ],
  },
];

const LINKS = GROUPS.flatMap((group) => group.links);
/** Mobile order: the four things a resident reaches for most, then More. */
const PRIMARY = ['/portal', '/portal/charges', '/portal/requests', '/portal/services']
  .map((path) => LINKS.find((link) => link.to === path))
  .filter((link): link is NavItem => Boolean(link));
/** the More sheet lists a section's own pages in place of the section */
const SECONDARY = LINKS.filter((link) => !link.primary).flatMap((link) => link.children ?? [link]);

export default function PortalLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const moreActive = SECONDARY.some((link) => pathname.startsWith(link.to));

  return (
    <div className="rs-shell">
      <aside className="rs-side">
        <Link to="/portal" className="rs-brand" aria-label="Garden View, overview">
          <img
            className="rs-brand-mark"
            src="/images/logo-icon-128.png"
            width={44}
            height={37}
            alt=""
            decoding="async"
          />
          <span className="rs-brand-text">
            <span className="rs-brand-name">Garden View</span>
            <span className="rs-brand-place">Beirut Central District</span>
          </span>
        </Link>

        <nav className="rs-nav" aria-label="Resident portal">
          {GROUPS.map((group) => (
            <div key={group.label} className="rs-nav-group">
              <p className="rs-nav-label">{group.label}</p>
              {group.links.map((link) => (
                <div key={link.to} className={link.children ? 'rs-nav-section' : undefined}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => (isActive ? 'is-active' : '')}
                  >
                    <link.icon size={17} />
                    <span>{link.label}</span>
                  </NavLink>
                  {link.children && (
                    <div className="rs-subnav">
                      {link.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          className={({ isActive }) => (isActive ? 'is-current' : '')}
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="rs-side-foot">
          <Link to="/portal/profile" className="rs-user">
            <span className="rs-avatar">{initials(account?.name)}</span>
            <span className="rs-user-text">
              <strong>{account?.name}</strong>
              <span>
                {account?.unit
                  ? `Block ${account.unit.block} · ${account.unit.number}`
                  : 'Resident account'}
              </span>
            </span>
            <IconChevronRight size={14} />
          </Link>
          <button type="button" className="rs-signout" onClick={handleLogout}>
            <IconLogout size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <header className="rs-mobile-bar">
        <Link to="/portal" className="rs-mobile-brand">
          <img src="/images/logo-icon-128.png" alt="" width={28} height={24} />
          Garden View
        </Link>
        <div className="rs-mobile-actions">
          <Link to="/portal/profile" className="rs-mobile-icon" aria-label="Your account">
            <IconUser size={17} />
          </Link>
          <button type="button" className="rs-mobile-icon" aria-label="Sign out" onClick={handleLogout}>
            <IconLogout size={17} />
          </button>
        </div>
      </header>

      <main className="rs-main">
        <Outlet />
      </main>

      <nav className="rs-tabs" aria-label="Sections">
        {PRIMARY.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <link.icon size={20} />
            <span>{link.short ?? link.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`rs-more-btn${moreActive || moreOpen ? ' is-active' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <IconMenu size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="rs-more" onClick={() => setMoreOpen(false)}>
          <nav className="rs-more-sheet" aria-label="More sections" onClick={(event) => event.stopPropagation()}>
            {SECONDARY.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => (isActive ? 'is-active' : '')}
              >
                <link.icon size={18} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
