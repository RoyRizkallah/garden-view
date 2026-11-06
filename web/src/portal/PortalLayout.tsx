import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
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
} from '../components/Icons';
import { initials } from './names';

type NavLinkItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: typeof IconHome;
  end?: boolean;
  primary?: boolean;
};

const GROUPS: { label: string; links: NavLinkItem[] }[] = [
  {
    label: 'Home',
    links: [{ to: '/portal', label: 'Overview', shortLabel: 'Overview', icon: IconHome, end: true, primary: true }],
  },
  {
    label: 'Your home',
    links: [
      { to: '/portal/residence', label: 'My Residence', shortLabel: 'Residence', icon: IconBuilding, primary: true },
      { to: '/portal/services', label: 'Services', shortLabel: 'Services', icon: IconWrench, primary: true },
      { to: '/portal/sell-rent', label: 'Sell & Rent', shortLabel: 'Sell', icon: IconTag },
      { to: '/portal/requests', label: 'Requests', shortLabel: 'Requests', icon: IconClipboard },
    ],
  },
  {
    label: 'The building',
    links: [
      { to: '/portal/charges', label: 'My Charges', shortLabel: 'Charges', icon: IconWallet },
      { to: '/portal/projects', label: 'Project Progress', shortLabel: 'Progress', icon: IconChart },
      { to: '/portal/voting', label: 'Voting', shortLabel: 'Voting', icon: IconBallot },
      { to: '/portal/meetings', label: 'Meetings', shortLabel: 'Meetings', icon: IconCalendar, primary: true },
      { to: '/portal/people', label: 'Our People', shortLabel: 'People', icon: IconUsers },
      { to: '/portal/documents', label: 'Documents', shortLabel: 'Docs', icon: IconDocument },
    ],
  },
];

const LINKS = GROUPS.flatMap((group) => group.links);

export default function PortalLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initial = initials(account?.name);
  const moreActive = LINKS.some((link) => !link.primary && (link.end ? pathname === link.to : pathname.startsWith(link.to)));

  return (
    <div className="portal-shell portal-shell-resident">
      <aside className="portal-sidebar">
        <div className="portal-sidebar-brand-block">
          <picture>
            <source type="image/webp" srcSet="/images/logo-full-192.webp 1x, /images/logo-full-384.webp 2x" />
            <img
              src="/images/logo-full-192.png"
              srcSet="/images/logo-full-192.png 1x, /images/logo-full-384.png 2x"
              width={176}
              height={152}
              alt="Garden View"
              className="portal-sidebar-logo-full"
              decoding="async"
            />
          </picture>
          <span>Beirut Central District</span>
        </div>

        <nav className="portal-nav portal-nav-grouped" aria-label="Resident">
          {GROUPS.map((group) => (
            <div key={group.label} className="portal-nav-group">
              <p className="portal-nav-label">{group.label}</p>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                  <link.icon size={18} />
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="portal-sidebar-footer">
          <Link to="/portal/profile" className="portal-account">
            <span className="portal-avatar">{initial}</span>
            <div>
              <strong>{account?.name}</strong>
              <span>{account?.unit ? `Unit ${account.unit.block}-${account.unit.number}` : account?.role}</span>
            </div>
            <IconChevronRight size={14} className="portal-account-chevron" />
          </Link>
          <button className="btn btn-outline btn-sm btn-block" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <header className="portal-mobile-bar">
        <span className="portal-mobile-brand">Garden View</span>
        <div className="portal-mobile-bar-actions">
          <Link to="/portal/profile" className="portal-mobile-account" aria-label="Profile">
            <IconUser size={17} />
          </Link>
          <button className="portal-mobile-account" aria-label="Sign out" onClick={handleLogout}>
            <IconLogout size={17} />
          </button>
        </div>
      </header>

      <main className="portal-main">
        <Outlet />
      </main>

      <nav className="portal-tab-bar">
        {LINKS.filter((link) => link.primary).map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <link.icon size={20} />
            <span>{link.shortLabel}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`portal-more-btn${moreActive || moreOpen ? ' is-active' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <IconMenu size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="portal-more" onClick={() => setMoreOpen(false)}>
          <nav className="portal-more-sheet" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {LINKS.filter((link) => !link.primary).map((link) => (
              <NavLink key={link.to} to={link.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => (isActive ? 'is-active' : '')}>
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
