import { useEffect, useMemo, useState } from 'react';
import Photo from '../../components/Photo';
import ResidencePlan from '../../components/ResidencePlan';
import { api, mediaUrl, type MyResidence } from '../api';
import { useAuth } from '../AuthContext';
import { SHOOT_CHAPTERS, formatDuration } from '../../data/photoshoot';
import { floorsLabel } from '../../data/listings';
import { matchResidence } from '../../data/useUnitPlan';
import { IconLayers, IconImage, IconHome } from '../../components/Icons';

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
  const blockPhotoCount = (chapter?.photos.length ?? 0) + (data?.blockImages.length ?? 0);

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

        <div className="rs-summary-item">
          <span className="rs-summary-icon">
            <IconImage size={17} />
          </span>
          <div>
            <p className="rs-summary-label">Block {block}</p>
            <p className="rs-summary-text">
              {blockPhotoCount > 0
                ? `${blockPhotoCount} photographs${
                    chapter?.film ? ` and a ${formatDuration(chapter.film.duration)} film` : ''
                  } of your block.`
                : `Photographs of Block ${block} appear here.`}
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

      {unit && (chapter || (data && data.blockImages.length > 0)) && (
        <>
          <div className="rs-section-head">
            <h2>Block {unit.block}</h2>
            <span style={{ fontSize: 12, color: 'var(--r-faint)' }}>Photographs &amp; film</span>
          </div>

          {chapter?.summary && (
            <p className="rs-project-desc" style={{ marginTop: -6, marginBottom: 16 }}>
              {chapter.summary}
            </p>
          )}

          {chapter?.film ? (
            <div className="rs-block">
              <figure className="rs-film">
                <video
                  controls
                  preload="none"
                  playsInline
                  poster={chapter.film.poster.replace(/\.jpg$/, '-1440.webp')}
                >
                  {chapter.film.sources.map((source) => (
                    <source key={source.src} src={source.src} media={source.media} type="video/mp4" />
                  ))}
                </video>
                <figcaption>
                  Block {unit.block} on film · {formatDuration(chapter.film.duration)}
                </figcaption>
              </figure>

              <div className="rs-photos">
                {data?.blockImages.map((image) => (
                  <figure key={image.id}>
                    <img src={mediaUrl(image.url)} alt={image.caption ?? `Block ${image.block}`} loading="lazy" />
                    {image.caption && <figcaption>{image.caption}</figcaption>}
                  </figure>
                ))}
                {chapter?.photos.map((photo) => (
                  <figure key={photo.src}>
                    <Photo src={photo.src} alt={photo.title} sizes="(max-width: 780px) 45vw, 220px" />
                    <figcaption>{photo.title}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : (
            <div className="rs-photos rs-photos-wide">
              {data?.blockImages.map((image) => (
                <figure key={image.id}>
                  <img src={mediaUrl(image.url)} alt={image.caption ?? `Block ${image.block}`} loading="lazy" />
                  {image.caption && <figcaption>{image.caption}</figcaption>}
                </figure>
              ))}
              {chapter?.photos.map((photo) => (
                <figure key={photo.src}>
                  <Photo src={photo.src} alt={photo.title} sizes="(max-width: 780px) 45vw, 260px" />
                  <figcaption>{photo.title}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
