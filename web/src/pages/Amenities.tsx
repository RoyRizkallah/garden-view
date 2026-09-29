import { Link } from 'react-router-dom';
import { AMENITY_CATEGORIES, LIFESTYLE_HIGHLIGHTS, BUILDING_FACTS } from '../data/building';
import PageHero from '../components/PageHero';
import Photo from '../components/Photo';
import {
  IconLeaf,
  IconDumbbell,
  IconSofa,
  IconCar,
  IconShield,
  IconLamp,
  IconMail,
  IconPhone,
  IconWhatsapp,
  IconArrowRight,
  IconExpand,
  IconBuilding,
  IconLayers,
  IconMapPin,
} from '../components/Icons';
import { heroImage } from '../data/routeHeroes';

const AMENITY_ICONS = {
  leaf: IconLeaf,
  dumbbell: IconDumbbell,
  sofa: IconSofa,
  car: IconCar,
  shield: IconShield,
  building: IconBuilding,
  lamp: IconLamp,
};

// Slot widths for `sizes` (1240 px container, 32 px side padding). The showcase grid is
// 1.3fr/0.85fr/0.85fr/1fr with 20 px gaps; it drops to 2 columns ≤ 900 px (featured and wide
// tiles spanning both) and to 1 column ≤ 560 px. Photos are object-fit: cover, so a slot
// taller than the source's aspect is height-bound: the featured tile spans two rows (~531 px
// tall on desktop → a 3:2 source needs ~800 px), and the 16:11 tiles need 1.22× their width
// for a 16:9 source.
const SIZES = {
  featured: '(max-width: 900px) calc(100vw - 64px), 800px',
  tile: '(max-width: 560px) calc(122vw - 78px), (max-width: 900px) calc(61vw - 51px), (max-width: 1240px) 24vw, 290px',
  wide: '(max-width: 560px) calc(100vw - 64px), 130px',
  cta: '(max-width: 900px) calc(100vw - 64px), 280px',
};

export default function Amenities() {
  const [featured, ...rest] = AMENITY_CATEGORIES;
  const gridItems = rest.slice(0, 4);
  const wide = rest[4];

  return (
    <>
      <PageHero
        image={heroImage('/amenities')}
        eyebrow="Amenities & Lifestyle"
        title="Designed for Well-Being"
        subtitle="Garden View's shared spaces are designed around residents' everyday needs — blending wellness, comfort, and convenience."
        height="tall"
      />

      <section className="amenities-dark-section">
        <div className="container">
          <p className="eyebrow" style={{ marginBottom: 24 }}>
            Curated Amenities
          </p>

          <div className="amenity-showcase">
            <Link to={featured.link} className="amenity-tile amenity-tile-featured">
              <Photo src={featured.image} alt="" sizes={SIZES.featured} />
              <div className="amenity-tile-featured-scrim" />
              <span className="amenity-tile-featured-tag">Featured</span>
              <span className="amenity-tile-expand">
                <IconExpand size={15} />
              </span>
              <div className="amenity-tile-featured-body">
                <h3>{featured.title}</h3>
                <p>{featured.description}</p>
                <span className="amenity-tile-link">
                  See the Gallery <IconArrowRight size={13} />
                </span>
              </div>
            </Link>

            {gridItems.map((a) => {
              const Icon = AMENITY_ICONS[a.icon];
              return (
                <div key={a.title} className="amenity-tile">
                  <div className="amenity-tile-media">
                    <Photo src={a.image} alt="" sizes={SIZES.tile} />
                    <span className="amenity-tile-badge">
                      <Icon size={16} />
                    </span>
                  </div>
                  <div className="amenity-tile-body">
                    <h3>{a.title}</h3>
                    <p>{a.description}</p>
                  </div>
                </div>
              );
            })}

            {wide && (
              <div className="amenity-tile amenity-tile-wide">
                <div className="amenity-tile-wide-media">
                  <Photo src={wide.image} alt="" sizes={SIZES.wide} />
                  <span className="amenity-tile-badge">
                    {(() => {
                      const Icon = AMENITY_ICONS[wide.icon];
                      return <Icon size={16} />;
                    })()}
                  </span>
                </div>
                <div className="amenity-tile-body">
                  <h3>{wide.title}</h3>
                  <p>{wide.description}</p>
                </div>
              </div>
            )}

            <div className="lifestyle-panel">
              <p className="eyebrow">Lifestyle Highlights</p>
              <ul>
                {LIFESTYLE_HIGHLIGHTS.map((h) => {
                  const Icon = AMENITY_ICONS[h.icon as keyof typeof AMENITY_ICONS];
                  return (
                    <li key={h.title}>
                      <span className="lifestyle-icon">
                        <Icon size={16} />
                      </span>
                      <div>
                        <strong>{h.title}</strong>
                        <span>{h.description}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <svg
                className="lifestyle-panel-decoration"
                viewBox="0 0 140 160"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M70 160V70" />
                <path d="M70 115c0-18 20-27 34-22-4 18-16 27-34 22Z" />
                <path d="M70 85c0-18-20-27-34-22 4 18 16 27 34 22Z" />
                <path d="M70 55c0-16 18-24 30-20-3 16-14 24-30 20Z" />
              </svg>
            </div>
          </div>

          <div className="amenities-stats-bar">
            <div className="services-fact">
              <IconBuilding size={20} />
              <div>
                <strong>{BUILDING_FACTS.units}</strong>
                <span>Residences</span>
              </div>
            </div>
            <div className="services-fact">
              <IconLayers size={20} />
              <div>
                <strong>{BUILDING_FACTS.blocks}</strong>
                <span>Blocks</span>
              </div>
            </div>
            <div className="services-fact">
              <IconLayers size={20} />
              <div>
                <strong>{BUILDING_FACTS.levels}</strong>
                <span>Levels</span>
              </div>
            </div>
            <div className="services-fact">
              <IconMapPin size={20} />
              <div>
                <strong>BCD</strong>
                <span>Beirut Central District</span>
              </div>
            </div>
          </div>

          <div className="amenities-cta-card">
            <div className="amenities-cta-image">
              <Photo src="/images/shoot/common-3.jpg" alt="" sizes={SIZES.cta} />
            </div>
            <div className="services-band-inner">
              <div>
                <p className="eyebrow" style={{ color: '#cdbf9e' }}>
                  Get in touch
                </p>
                <h2>Experience Garden View Lifestyle</h2>
                <p>Schedule a private tour and discover the amenities that elevate everyday living.</p>
                <Link to="/location" className="btn btn-gold" style={{ marginTop: 18 }}>
                  Request a Private Tour
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
                  <IconWhatsapp size={18} />
                  <span>Chat on WhatsApp — pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
