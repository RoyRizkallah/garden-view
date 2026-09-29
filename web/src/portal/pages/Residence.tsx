import { useEffect, useMemo, useState } from 'react';
import Photo from '../../components/Photo';
import ResidencePlan from '../../components/ResidencePlan';
import ListingPanel from './ListingPanel';
import { api, mediaUrl, type MyResidence } from '../api';
import { SHOOT_CHAPTERS, formatDuration } from '../../data/photoshoot';
import { floorsLabel } from '../../data/listings';
import { matchResidence, residenceLevels } from '../../data/useUnitPlan';
import { IconLayers, IconImage, IconTag, IconHome } from '../../components/Icons';

const UNMATCHED_COPY = 'Your floor plan will appear here once your residence is matched to the plan set.';

/* ---------- Page ---------- */

export default function Residence() {
  const [data, setData] = useState<MyResidence | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<MyResidence>('/resident/residence')
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const unit = data?.unit;
  // Matching is pure and cheap; the stage (and its fetches) lives in ResidencePlan.
  const residence = useMemo(() => matchResidence(unit?.block, unit?.number), [unit?.block, unit?.number]);
  const levels = useMemo(() => (residence ? residenceLevels(residence) : []), [residence]);
  const matched = residence !== null;
  // the professional shoot of the resident's own block, plus any photos management adds
  const chapter = SHOOT_CHAPTERS.find((c) => c.id === `block-${(unit?.block ?? '').toLowerCase()}`);
  const blockPhotoCount = (chapter?.photos.length ?? 0) + (data?.blockImages.length ?? 0);

  return (
    <div className="portal-page">
      <section className="portal-hero" style={{ minHeight: 150 }}>
        <Photo src={chapter?.photos.find((ph) => ph.tag === 'Exterior')?.src ?? '/images/shoot/block-a-2.jpg'} alt="" sizes="100vw" />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            <IconHome size={14} />
            Your Home
          </p>
          <h1>Residence {residence?.apartment ?? unit?.number ?? ''}</h1>
          <p className="portal-hero-sub">
            {residence ? `Block ${residence.block} · ${floorsLabel(residence.floors)}` : unit ? `Block ${unit.block}` : 'Garden View'}
          </p>
        </div>
      </section>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-residence-summary">
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconLayers size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">Floor Plan</p>
            <p className="portal-residence-summary-desc">
              {matched
                ? `As-built 3D plan of ${levels.map((l) => l.label).join(' and ')} — view below.`
                : UNMATCHED_COPY}
            </p>
          </div>
        </div>
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconImage size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">Block {unit?.block ?? ''} Photos</p>
            <p className="portal-residence-summary-desc">
              {blockPhotoCount > 0
                ? `${blockPhotoCount} photographs${chapter?.film ? ` and a ${formatDuration(chapter.film.duration)} film` : ''} of your block, below.`
                : `Photos of Block ${unit?.block ?? 'your building'} appear here.`}
            </p>
          </div>
        </div>
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconTag size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">Sell or Rent</p>
            <p className="portal-residence-summary-desc">
              List your home on the website with your own photos and its 3D floor plan.
            </p>
          </div>
        </div>
      </div>

      {unit && matched && (
        <>
          <div className="portal-doc-category-head">
            <span className="portal-doc-category-icon">
              <IconLayers size={16} />
            </span>
            <p>My Floor Plan</p>
          </div>
          <ResidencePlan unit={unit} />
        </>
      )}

      {/* An admin-uploaded plan document still shows on its own when the residence is unmatched. */}
      {unit?.floorPlanUrl &&
        !matched &&
        (unit.floorPlanUrl.toLowerCase().endsWith('.pdf') ? (
          <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-floorplan-link">
            <IconLayers size={20} />
            <span>Plan document (PDF)</span>
          </a>
        ) : (
          <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-floorplan-card">
            <img src={unit.floorPlanUrl} alt={`Plan document for Unit ${unit.block}-${unit.number}`} />
          </a>
        ))}

      {unit && (chapter || (data && data.blockImages.length > 0)) && (
        <>
          <div className="portal-doc-category-head">
            <span className="portal-doc-category-icon">
              <IconImage size={16} />
            </span>
            <p>Block {unit.block}</p>
          </div>
          {chapter && <p className="rs-block-lede">{chapter.summary}</p>}
          <div className="rs-block">
            {chapter?.film && (
              <figure className="rs-film">
                <video controls preload="none" playsInline poster={chapter.film.poster.replace(/\.jpg$/, '-1440.webp')}>
                  {chapter.film.sources.map((src) => (
                    <source key={src.src} src={src.src} media={src.media} type="video/mp4" />
                  ))}
                </video>
                <figcaption>Block {unit.block} on film · {formatDuration(chapter.film.duration)}</figcaption>
              </figure>
            )}
            <div className="rs-photos">
              {data?.blockImages.map((img) => (
                <figure key={img.id}>
                  <img src={mediaUrl(img.url)} alt={img.caption ?? `Block ${img.block}`} loading="lazy" />
                  {img.caption && <figcaption>{img.caption}</figcaption>}
                </figure>
              ))}
              {chapter?.photos.map((ph) => (
                <figure key={ph.src}>
                  <Photo src={ph.src} alt={ph.title} sizes="(max-width: 960px) 45vw, 260px" />
                  <figcaption>{ph.title}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="portal-doc-category-head" id="list-your-home">
        <span className="portal-doc-category-icon">
          <IconTag size={16} />
        </span>
        <p>Sell or Rent Your Home</p>
      </div>
      {data && <ListingPanel unitCode={unit?.number ?? ''} listings={data.listingRequests} onChange={load} />}
    </div>
  );
}
