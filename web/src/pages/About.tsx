import { Link } from 'react-router-dom';
import { BUILDING_FACTS } from '../data/building';
import PageHero from '../components/PageHero';
import HighlightStrip from '../components/HighlightStrip';
import Photo from '../components/Photo';
import { IconBuilding, IconLayers, IconArrowRight } from '../components/Icons';

// .about-image is a fixed 460 px tall, object-fit: cover slot at every width (564 px wide on
// desktop, full-width ≤ 900 px), so a 16:9 source is always height-bound: 460 × 16/9 ≈ 820 px.
const ABOUT_IMAGE_SIZES = '820px';

export default function About() {
  return (
    <>
      <PageHero
        image="/images/shoot/block-c-5.jpg"
        eyebrow="About"
        title={
          <>
            About
            <br />
            <span className="accent">Garden View</span>
          </>
        }
        subtitle={`Garden View is a residential building in Beirut Central District, comprising ${BUILDING_FACTS.units} residences across ${BUILDING_FACTS.blocks} blocks and ${BUILDING_FACTS.levels} levels.`}
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
        <div className="container about-grid">
          <div>
            <p className="eyebrow">Our Building</p>
            <h2>Designed for Everyday Living</h2>
            <p>
              This site is being built out in phases as more building data — floor plans, unit
              details, and amenity information — is confirmed with building management.
            </p>
            <p>What you see today reflects what's confirmed so far.</p>
            <Link to="/floor-plans" className="btn btn-outline-gold" style={{ marginTop: 10 }}>
              View Floor Plans <IconArrowRight size={14} />
            </Link>
          </div>
          <Photo
            src="/images/shoot/block-c-2.jpg"
            alt="Block C's covered entrance"
            className="about-image"
            sizes={ABOUT_IMAGE_SIZES}
            eager
          />
        </div>
      </section>

      <section className="section section-dark" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="about-stats-row">
            <div className="about-stat-card">
              <span className="about-stat-icon">
                <IconBuilding size={22} />
              </span>
              <strong>{BUILDING_FACTS.units}</strong>
              <p className="about-stat-label">Residences</p>
              <p className="about-stat-desc">Modern homes designed for comfort and privacy.</p>
            </div>
            <div className="about-stat-card">
              <span className="about-stat-icon">
                <IconLayers size={22} />
              </span>
              <strong>{BUILDING_FACTS.blocks}</strong>
              <p className="about-stat-label">Blocks</p>
              <p className="about-stat-desc">Block A, Block B, and Block C.</p>
            </div>
            <div className="about-stat-card">
              <span className="about-stat-icon">
                <IconLayers size={22} />
              </span>
              <strong>{BUILDING_FACTS.levels}</strong>
              <p className="about-stat-label">Levels</p>
              <p className="about-stat-desc">Thoughtfully planned across every block.</p>
            </div>
          </div>

          <HighlightStrip />
        </div>
      </section>
    </>
  );
}
