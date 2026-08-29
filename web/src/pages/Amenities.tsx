import { Link } from 'react-router-dom';
import { AMENITY_CATEGORIES, LIFESTYLE_HIGHLIGHTS, BUILDING_FACTS } from '../data/building';
import PageHero from '../components/PageHero';
import {
  IconLeaf,
  IconDumbbell,
  IconSofa,
  IconCar,
  IconShield,
  IconMail,
  IconPhone,
  IconWhatsapp,
  IconArrowRight,
  IconExpand,
  IconBuilding,
  IconLayers,
  IconMapPin,
} from '../components/Icons';

const AMENITY_ICONS = {
  leaf: IconLeaf,
  dumbbell: IconDumbbell,
  sofa: IconSofa,
  car: IconCar,
  shield: IconShield,
};

export default function Amenities() {
  const [featured, ...rest] = AMENITY_CATEGORIES;
  const gridItems = rest.slice(0, 4);
  const wide = rest[4];

  return (
    <>
      <PageHero
        image="/images/exterior-07.jpg"
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
            <Link to="/location" className="amenity-tile amenity-tile-featured">
              <img src={featured.image} alt="" />
              <div className="amenity-tile-featured-scrim" />
              <span className="amenity-tile-featured-tag">Featured</span>
              <span className="amenity-tile-expand">
                <IconExpand size={15} />
              </span>
              <div className="amenity-tile-featured-body">
                <h3>{featured.title}</h3>
                <p>{featured.description}</p>
                <span className="amenity-tile-link">
                  Learn More <IconArrowRight size={13} />
                </span>
              </div>
            </Link>

            {gridItems.map((a) => {
              const Icon = AMENITY_ICONS[a.icon];
              return (
                <div key={a.title} className="amenity-tile">
                  <div className="amenity-tile-media">
                    <img src={a.image} alt="" />
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
                  <img src={wide.image} alt="" />
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
              <img src="/images/exterior-02.jpg" alt="" />
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
