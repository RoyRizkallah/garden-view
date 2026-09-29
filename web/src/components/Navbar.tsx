import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Logo from './Logo';
import { IconClose } from './Icons';

const LINKS = [
  { to: '/residences', label: 'Residences' },
  { to: '/listings', label: 'Sale & Rent' },
  { to: '/amenities', label: 'Amenities' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/explorer', label: '3D Explorer' },
  { to: '/location', label: 'Location' },
  { to: '/about', label: 'About' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`navbar ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <div className="container navbar-inner">
        <NavLink to="/" className="navbar-brand" onClick={close}>
          <Logo />
        </NavLink>

        <nav className="navbar-links">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          <NavLink to="/login" className="navbar-resident-link">
            Resident Login
          </NavLink>
          <NavLink to="/location" className="btn btn-outline-gold btn-sm">
            Request a Tour
          </NavLink>
          <button
            className="navbar-toggle"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={`navbar-drawer-backdrop ${open ? 'is-open' : ''}`} onClick={close} />
      <div className={`navbar-drawer ${open ? 'is-open' : ''}`}>
        <button className="navbar-drawer-close" aria-label="Close menu" onClick={close}>
          <IconClose size={20} />
        </button>
        <nav className="navbar-drawer-links">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              onClick={close}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="navbar-drawer-actions">
          <NavLink to="/login" className="btn btn-outline btn-on-dark btn-block" onClick={close}>
            Resident Login
          </NavLink>
          <NavLink to="/location" className="btn btn-gold btn-block" onClick={close}>
            Request a Tour
          </NavLink>
        </div>
      </div>
    </header>
  );
}
