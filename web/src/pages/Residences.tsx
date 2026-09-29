import { Link } from 'react-router-dom';
import { BUILDING_FACTS, BLOCKS, GALLERY_IMAGES } from '../data/building';
import PageHero from '../components/PageHero';
import HighlightStrip from '../components/HighlightStrip';
import Photo from '../components/Photo';
import {
  IconBuilding,
  IconArrowRight,
  IconPhone,
  IconMail,
  IconMapPin,
  IconWhatsapp,
} from '../components/Icons';
import { heroImage } from '../data/routeHeroes';

const GALLERY = GALLERY_IMAGES.slice(0, 6);

// Slot widths for `sizes` (1240 px container, 32 px side padding):
// block tiles — 3 equal columns, 20 px gaps, stacked ≤ 900 px.
const BLOCK_TILE_SIZES = '(max-width: 900px) calc(100vw - 64px), (max-width: 1240px) calc((100vw - 104px) / 3), 379px';
// gallery bento — 1.1fr + 3 × 1fr columns, 18 px gaps; 2 columns ≤ 900 px with the featured
// and 5th items spanning both. The tiles are object-fit: cover in fixed-height rows, so the
// width a 16:9 / 3:2 source needs is the row height × its aspect once the slot is narrower
// than that (featured: 378 px tall on desktop → 566 px; tiles: 160 px tall ≤ 900 px → 285 px).
const GALLERY_SIZES = {
  featured: '(max-width: 900px) calc(100vw - 64px), 566px',
  wide: '(max-width: 900px) calc(100vw - 64px), (max-width: 1240px) 46vw, 565px',
  tile: '(max-width: 652px) 285px, (max-width: 900px) calc(50vw - 41px), (max-width: 1240px) 22vw, 274px',
};

export default function Residences() {
  return (
    <>
      <PageHero
        image={heroImage('/residences')}
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
                  <Photo src={block.image} alt="" sizes={BLOCK_TILE_SIZES} />
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
                <Photo
                  src={img.src}
                  alt={img.caption}
                  sizes={i === 0 ? GALLERY_SIZES.featured : i === 4 ? GALLERY_SIZES.wide : GALLERY_SIZES.tile}
                />
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
