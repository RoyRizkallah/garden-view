import { useEffect, useMemo, useState } from 'react';
import Photo from '../../components/Photo';
import ResidencePlan from '../../components/ResidencePlan';
import { api, type MyResidence } from '../api';
import { useAuth } from '../AuthContext';
import { SHOOT_CHAPTERS } from '../../data/photoshoot';
import { floorsLabel } from '../../data/listings';
import { matchResidence } from '../../data/useUnitPlan';
import { IconLayers, IconHome } from '../../components/Icons';

const HERO_SIZES = '(max-width: 1080px) calc(100vw - 40px), calc(100vw - 384px)';

export default function Residence() {
  const { account } = useAuth();
  const [data, setData] = useState<MyResidence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MyResidence>('/resident/residence')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const unit = data?.unit;
  const block = unit?.block ?? account?.unit?.block ?? 'A';
  const number = unit?.number ?? account?.unit?.number ?? '';
  const residence = useMemo(() => matchResidence(block, number), [block, number]);
  const matched = residence !== null;

  const chapter = SHOOT_CHAPTERS.find((item) => item.id === `block-${block.toLowerCase()}`);
  const heroPhoto =
    chapter?.photos.find((photo) => photo.tag === 'Exterior')?.src ?? `/images/shoot/block-${block.toLowerCase()}-2.jpg`;

  return (
    <div className="rs-page">
      <section className="rs-hero rs-hero-short">
        <Photo src={heroPhoto} alt="" sizes={HERO_SIZES} priority />
        <div className="rs-hero-scrim" />
        <div className="rs-hero-content">
          <p className="rs-hero-date">
            <IconHome size={14} /> Your home
          </p>
          <h1>Residence {residence?.apartment ?? number}</h1>
          <p className="rs-hero-sub">
            {residence ? `Block ${residence.block} · ${floorsLabel(residence.floors)}` : `Block ${block}`}
          </p>
        </div>
      </section>

      {error && (
        <div className="rs-note" style={{ marginTop: 16 }}>
          <IconLayers size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="rs-summary">
        <div className="rs-summary-item">
          <span className="rs-summary-icon">
            <IconLayers size={17} />
          </span>
          <div>
            <p className="rs-summary-label">Floor plan</p>
            <p className="rs-summary-text">
              {matched
                ? 'The as-built 3D plan of your residence, measured from the building drawings.'
                : 'Your floor plan appears here once your residence is matched to the plan set.'}
            </p>
          </div>
        </div>
      </div>

      {unit && matched && <ResidencePlan unit={unit} />}

      {unit?.floorPlanUrl && !matched && (
        <div style={{ marginTop: 20 }}>
          {unit.floorPlanUrl.toLowerCase().endsWith('.pdf') ? (
            <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="rs-btn rs-btn-outline">
              <IconLayers size={16} /> Plan document (PDF)
            </a>
          ) : (
            <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer">
              <img
                src={unit.floorPlanUrl}
                alt={`Plan document for Residence ${number}`}
                style={{ width: '100%', borderRadius: 16 }}
              />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
