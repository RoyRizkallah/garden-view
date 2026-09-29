import { Link } from 'react-router-dom';
import { GALLERY_IMAGES, AMENITY_CATEGORIES } from '../data/building';
import {
  IconLeaf,
  IconDumbbell,
  IconSofa,
  IconCar,
  IconShield,
  IconBuilding,
  IconLamp,
  IconLayers,
  IconMapPin,
} from '../components/Icons';
import LocationMap from '../components/LocationMap';
import ContactDetails from '../components/ContactDetails';
import Photo from '../components/Photo';
import Prologue from '../components/cinematic/Prologue';

// Slot widths for `sizes`: the bento sits in the 1240 px container (32 px side padding); the
// amenities cell is the 1.7fr column of a 1.7fr/1fr/1.15fr row and stacks full-width ≤ 960 px.
const AMENITIES_CELL_SIZES = '(max-width: 960px) calc(100vw - 64px), (max-width: 1240px) 49vw, 610px';

const AMENITY_ICONS = {
  leaf: IconLeaf,
  dumbbell: IconDumbbell,
  sofa: IconSofa,
  car: IconCar,
  shield: IconShield,
  building: IconBuilding,
  lamp: IconLamp,
};

export default function Home() {
  return (
    <>
      <Prologue />

      <section className="home-bento">
        <div className="home-bento-row home-bento-row-3">
          <div className="home-bento-cell home-bento-amenities">
            <Photo
              src="/images/shoot/gym-3.jpg"
              alt="The indoor pool at Garden View"
              sizes={AMENITIES_CELL_SIZES}
            />
            <div className="home-bento-amenities-scrim" />
            <div className="home-bento-amenities-top">
              <p className="eyebrow" style={{ color: '#e9e1cc' }}>
                Curated Amenities
              </p>
              <h2>Everyday Spaces, Shared Well</h2>
            </div>
            <div className="home-bento-amenities-bottom">
              <ul className="home-amenity-icons">
                {AMENITY_CATEGORIES.map((a) => {
                  const Icon = AMENITY_ICONS[a.icon];
                  return (
                    <li key={a.title}>
                      <Icon size={19} />
                      <span>{a.title}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Link to="/amenities" className="home-bento-link home-bento-link-overlay">
              View All Amenities →
            </Link>
          </div>

          <div className="home-bento-cell">
            <p className="eyebrow">Gallery Preview</p>
            <h2>A Glimpse of Garden View</h2>
            <div className="home-bento-thumbs">
              {GALLERY_IMAGES.slice(0, 3).map((img) => (
                <Photo key={img.src} src={img.src} alt={img.caption} sizes="100px" />
              ))}
            </div>
            <Link to="/gallery" className="home-bento-link">
              View Gallery →
            </Link>
          </div>

          <div className="home-bento-cell home-bento-explorer">
            <span className="home-bento-explorer-badge">
              <IconLayers size={16} />
            </span>
            <p className="eyebrow">3D Building Explorer</p>
            <h2>See Garden View in 3D</h2>
            <p className="home-bento-copy">
              Every block, floor and residence, modelled from the architect's as-built drawings.
            </p>
            <Link to="/explorer" className="home-bento-link">
              Open the 3D Explorer →
            </Link>
          </div>
        </div>

        <div className="home-bento-row home-bento-row-2">
          <div className="home-bento-cell">
            <p className="eyebrow">
              <IconMapPin size={12} className="eyebrow-icon" />
              Prime Location
            </p>
            <h2>At the Center of It All</h2>
            <p className="home-bento-copy">
              In the heart of Beirut Central District, the city's historic centre.
            </p>
            <div className="home-bento-map">
              <LocationMap />
            </div>
            <Link to="/location" className="home-bento-link">
              Explore the Neighborhood →
            </Link>
          </div>

          <div className="home-bento-cell home-bento-contact">
            <p className="eyebrow" style={{ color: '#cdbf9e' }}>
              Get in Touch
            </p>
            <h2>Experience Garden View</h2>
            <p className="home-bento-copy">
              Schedule a private tour and discover refined living in Beirut Central District.
            </p>
            <Link to="/location" className="btn btn-gold" style={{ marginTop: 10 }}>
              Request a Tour
            </Link>
            <ContactDetails className="home-bento-contact-list" iconSize={16} />
            <svg className="home-bento-leaf-deco" viewBox="0 0 120 120" fill="none">
              <path d="M10 110c30 4 55-20 55-55C40 55 8 78 10 110Z" stroke="currentColor" strokeWidth="1" />
              <path d="M10 110c12-24 25-36 55-50" stroke="currentColor" strokeWidth="1" />
              <path d="M35 115c22 2 40-14 40-38-18 0-38 16-40 38Z" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
        </div>
      </section>
    </>
  );
}
