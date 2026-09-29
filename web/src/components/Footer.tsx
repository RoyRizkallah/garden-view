import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p className="footer-tagline">
            One residential building in the heart of Beirut Central District — 41 residences
            across 3 blocks.
          </p>
        </div>

        <div>
          <p className="footer-heading">Explore</p>
          <ul>
            <li>
              <Link to="/residences">Residences</Link>
            </li>
            <li>
              <Link to="/listings">For Sale &amp; Rent</Link>
            </li>
            <li>
              <Link to="/amenities">Amenities</Link>
            </li>
            <li>
              <Link to="/gallery">Gallery</Link>
            </li>
            <li>
              <Link to="/explorer">3D Explorer</Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="footer-heading">Building</p>
          <ul>
            <li>
              <Link to="/location">Location</Link>
            </li>
            <li>
              <Link to="/about">About</Link>
            </li>
            <li>
              <Link to="/location">Contact</Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="footer-heading">Get in touch</p>
          <p className="footer-note">
            Direct phone, email, and WhatsApp details will be added here once confirmed by
            building management — use the contact form for now.
          </p>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>&copy; {year} Garden View. All rights reserved.</span>
        <span>Beirut Central District, Lebanon</span>
        <span className="footer-credit" title="Site built by BMV AI">
          <img
            src="/images/bmv-ai-logo-32.png"
            srcSet="/images/bmv-ai-logo-32.png 1x, /images/bmv-ai-logo-64.png 2x"
            width={16}
            height={16}
            alt="BMV AI"
            loading="lazy"
            decoding="async"
          />
          Built by BMV AI
        </span>
      </div>
    </footer>
  );
}
