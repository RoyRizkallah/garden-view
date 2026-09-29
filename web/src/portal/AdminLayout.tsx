import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Photo from '../components/Photo';
import {
  IconHome,
  IconWallet,
  IconChart,
  IconBallot,
  IconClipboard,
  IconUsers,
  IconUser,
  IconMail,
  IconTag,
  IconImage,
  IconLogout,
  IconDocument,
  IconMenu,
} from '../components/Icons';
import { initials } from './names';
import '../styles/admin.css';

// `primary` links sit in the phone tab bar; the rest open from "More"
const LINKS = [
  { to: '/admin', label: 'Overview', shortLabel: 'Overview', icon: IconHome, end: true, primary: true },
  { to: '/admin/charges', label: 'Charges', shortLabel: 'Charges', icon: IconWallet },
  { to: '/admin/projects', label: 'Projects', shortLabel: 'Projects', icon: IconChart },
  { to: '/admin/votes', label: 'Votes', shortLabel: 'Votes', icon: IconBallot },
  { to: '/admin/requests', label: 'Requests', shortLabel: 'Requests', icon: IconClipboard, primary: true },
  { to: '/admin/residents', label: 'Residents', shortLabel: 'Residents', icon: IconUsers, primary: true },
  { to: '/admin/listings', label: 'Listings', shortLabel: 'Listings', icon: IconTag, primary: true },
  { to: '/admin/documents', label: 'Documents', shortLabel: 'Documents', icon: IconDocument },
  { to: '/admin/photos', label: 'Photos', shortLabel: 'Photos', icon: IconImage },
  { to: '/admin/inquiries', label: 'Inquiries', shortLabel: 'Inquiries', icon: IconMail },
  { to: '/admin/profile', label: 'Profile & Password', shortLabel: 'Profile', icon: IconUser },
];

export default function AdminLayout() {
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

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-sidebar-photo">
          {/* the sidebar is a fixed 264 px column */}
          <Photo src="/images/shoot/block-a-6.jpg" alt="" sizes="264px" eager />
          <div className="portal-sidebar-photo-scrim" />
          <div className="portal-sidebar-brand">
            <strong>Garden View</strong>
            <span>Admin</span>
          </div>
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
          <div className="portal-account">
            <span className="portal-avatar">{initial}</span>
            <div>
              <strong>{account?.name}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button className="btn btn-outline btn-sm btn-block" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <header className="portal-mobile-bar">
        <span className="portal-mobile-brand">Garden View Admin</span>
        <button className="portal-mobile-account" aria-label="Sign out" onClick={handleLogout}>
          <IconLogout size={17} />
        </button>
      </header>

      <main className="portal-main">
        <Outlet />
      </main>

      <nav className="portal-tab-bar">
        {LINKS.filter((l) => l.primary).map((link) => (
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
        <button
          type="button"
          className={`ad-more-btn${LINKS.some((l) => !l.primary && pathname.startsWith(l.to)) ? ' is-active' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <IconMenu size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="ad-more" onClick={() => setMoreOpen(false)}>
          <nav className="ad-more-sheet" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {LINKS.filter((l) => !l.primary).map((link) => (
              <NavLink key={link.to} to={link.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                <link.icon size={20} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
