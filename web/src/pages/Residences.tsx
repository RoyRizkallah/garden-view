import { Link } from 'react-router-dom';
import { BUILDING_FACTS, BLOCKS, GALLERY_IMAGES } from '../data/building';
import PageHero from '../components/PageHero';
import HighlightStrip from '../components/HighlightStrip';
import {
  IconBuilding,
  IconArrowRight,
  IconPhone,
  IconMail,
  IconMapPin,
  IconWhatsapp,
} from '../components/Icons';

const GALLERY = GALLERY_IMAGES.slice(0, 6);

export default function Residences() {
  return (
    <>
      <PageHero
        image="/images/exterior-09.jpg"
        eyebrow="Beirut Central District"
        title="Residences"
        subtitle="Three residential blocks. Forty-one residences. Designed for privacy, comfort, and everyday living."
        height="tall"
      >
        <div className="hero-stats" style={{ marginTop: 32 }}>
          <div className="hero-stat">
            <strong>{BUILDING_FACTS.units}</strong>
            <span>Residences</span>
          </div>
          <div className="hero-stat">
            <strong>{BUILDING_FACTS.blocks}</strong>
            <span>Blocks</span>
          </div>
          <div className="hero-stat">
            <strong>{BUILDING_FACTS.levels}</strong>
            <span>Levels</span>
          </div>
        </div>
      </PageHero>

      <section className="section section-dark">
        <div className="container">
          <p className="eyebrow" style={{ marginBottom: 24 }}>
            Choose Your Block
          </p>

          <div className="block-showcase">
            {BLOCKS.map((block) => (
              <div key={block.name} className="block-tile">
                <div className="block-tile-media">
                  <img src={block.image} alt="" />
                  <div className="block-tile-scrim" />
                  <span className="block-tile-icon">
                    <IconBuilding size={16} />
                  </span>
                </div>
                <div className="block-tile-body">
                  <div>
                    <h3>{block.name}</h3>
                    <span>{block.units} units</span>
                  </div>
                  <Link to="/location" className="amenity-tile-link">
                    Explore {block.name} <IconArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <HighlightStrip />
        </div>
      </section>

      <section className="section section-dark" style={{ paddingTop: 0 }}>
        <div className="container">
          <p className="eyebrow" style={{ marginBottom: 24 }}>
            Residences &amp; Spaces
          </p>
          <div className="residence-gallery-bento">
            {GALLERY.map((img, i) => (
              <div key={img.src} className={`residence-gallery-item${i === 0 ? ' is-featured' : ''}`}>
                <img src={img.src} alt={img.caption} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="availability-card">
            <div>
              <p className="eyebrow" style={{ color: '#cdbf9e' }}>
                Current Availability
              </p>
              <h2>Listing Details Are Being Finalized</h2>
              <p>
                We're finalizing details for available residences. Contact us to get early access
                to floor plans and pricing once confirmed.
              </p>
              <Link to="/location" className="btn btn-gold" style={{ marginTop: 18 }}>
                Contact Us About Availability
                <IconArrowRight size={14} />
              </Link>
            </div>
            <div className="services-band-contact">
              <div className="contact-icon-item">
                <IconPhone size={18} />
                <span>Phone — pending</span>
              </div>
              <div className="contact-icon-item">
                <IconMail size={18} />
                <span>Email — pending</span>
              </div>
              <div className="contact-icon-item">
                <IconMapPin size={18} />
                <span>Office — pending</span>
              </div>
              <div className="contact-icon-item">
                <IconWhatsapp size={18} />
                <span>Chat on WhatsApp — pending</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
