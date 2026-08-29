import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  IconHome,
  IconWallet,
  IconChart,
  IconBallot,
  IconClipboard,
  IconBuilding,
  IconDocument,
  IconUser,
  IconLogout,
  IconChevronRight,
} from '../components/Icons';

const LINKS = [
  { to: '/portal', label: 'Overview', shortLabel: 'Overview', icon: IconHome, end: true },
  { to: '/portal/charges', label: 'My Charges', shortLabel: 'Charges', icon: IconWallet },
  { to: '/portal/projects', label: 'Project Progress', shortLabel: 'Progress', icon: IconChart },
  { to: '/portal/voting', label: 'Voting', shortLabel: 'Voting', icon: IconBallot },
  { to: '/portal/requests', label: 'Requests', shortLabel: 'Requests', icon: IconClipboard },
  { to: '/portal/residence', label: 'My Residence', shortLabel: 'Residence', icon: IconBuilding },
  { to: '/portal/documents', label: 'Documents', shortLabel: 'Docs', icon: IconDocument },
];

export default function PortalLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initial = account?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="portal-shell portal-shell-resident">
      <aside className="portal-sidebar">
        <div className="portal-sidebar-brand-block">
          <img src="/images/logo-full.png" alt="Garden View" className="portal-sidebar-logo-full" />
          <span>Beirut Central District</span>
        </div>

        <nav className="portal-nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="portal-sidebar-footer">
          <Link to="/portal/profile" className="portal-account">
            <span className="portal-avatar">{initial}</span>
            <div>
              <strong>{account?.name}</strong>
              <span>
                {account?.unit ? `Unit ${account.unit.block}-${account.unit.number}` : account?.role}
              </span>
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
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            <link.icon size={20} />
            <span>{link.shortLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
