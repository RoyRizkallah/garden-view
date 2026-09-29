import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Photo from '../components/Photo';
import ResidencePlan from '../components/ResidencePlan';
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconLayers, IconPlay, IconTag } from '../components/Icons';
import { SHOOT_CHAPTERS, formatDuration } from '../data/photoshoot';
import { useResidenceArea } from '../data/planAreas';
import { mediaUrl } from '../portal/api';
import { enquireHref, floorsLabel, kindLabel, priceLabel, usePublicListing, type Listing } from '../data/listings';
import { ListingFacts } from './Listings';
import '../styles/listings.css';

// One home's page: the owner's own photographs first, then the terms, the owner's description,
// the home's 3D floor plan from the as-built model (the residence lit), and its block.

const BLOCK_PHOTO_SIZES = '(max-width: 640px) 50vw, 290px';

export default function ListingDetail() {
  const { id } = useParams();
  const state = usePublicListing(id);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.listing.unit} ${state.listing.type === 'SALE' ? 'for sale' : 'for rent'} | Garden View`;
    return () => {
      document.title = 'Garden View | Beirut Central District';
    };
  }, [state]);

  return (
    <section className="section section-dark listing-page">
      <div className="container">
        <Link to="/listings" className="listing-back">
          <IconChevronLeft size={15} /> All homes for sale &amp; rent
        </Link>

        {state.status === 'loading' && <div className="listing-page-skeleton" aria-busy="true" aria-label="Loading" />}

        {state.status === 'gone' && (
          <div className="listings-empty">
            <IconTag size={22} />
            <h1>This home is no longer listed</h1>
            <p>It may have been sold or let, or the owner has taken the listing down.</p>
            <Link to="/listings" className="btn btn-gold btn-sm">
              See Homes Available Now <IconArrowRight size={14} />
            </Link>
          </div>
        )}

        {state.status === 'error' && (
          <div className="listings-empty">
            <h1>This listing could not be loaded</h1>
            <button type="button" className="btn btn-gold btn-sm" onClick={state.retry}>
              Try Again
            </button>
          </div>
        )}

        {state.status === 'ready' && <ListingBody listing={state.listing} />}
      </div>
    </section>
  );
}

function ListingBody({ listing: l }: { listing: Listing }) {
  const area = useResidenceArea(l.record?.apartment);
  const chapter = SHOOT_CHAPTERS.find((c) => c.id === `block-${l.block.toLowerCase()}`);
  return (
    <>
      <div className="listing-top">
        <Gallery listing={l} />
        <aside className="listing-summary">
          <span className={`listing-badge is-${l.type.toLowerCase()}`}>{l.type === 'SALE' ? 'For Sale' : 'For Rent'}</span>
          <p className="listing-where">
            Block {l.block}
            {l.record && ` · ${floorsLabel(l.record.floors)}`}
          </p>
          <h1 className="listing-code">{l.unit}</h1>
          {l.record && <p className="listing-kind">{kindLabel(l)}</p>}
          <p className="listing-price">{priceLabel(l)}</p>
          <ListingFacts
            listing={l}
            area={area.status === 'ready' ? { code: l.unit, levels: area.levels, netSqm: area.netSqm, outdoorSqm: area.outdoorSqm, complete: area.complete } : undefined}
          />
          <Link to={enquireHref(l)} className="btn btn-gold btn-block">
            Enquire About This Home <IconArrowRight size={14} />
          </Link>
          <p className="listing-summary-note">Building management will put you in touch with the owner and arrange a viewing.</p>
        </aside>
      </div>

      {l.description && (
        <div className="listing-block listing-description">
          <h2>About this home</h2>
          <p>{l.description}</p>
        </div>
      )}

      {l.record && (
        <div className="listing-block" id="floor-plan">
          <h2>
            <IconLayers size={18} /> 3D floor plan
          </h2>
          <LazyWhenVisible minHeight={560}>
            <ResidencePlan unit={{ block: l.block, number: l.unit }} audience="public" />
          </LazyWhenVisible>
        </div>
      )}

      {chapter && (
        <div className="listing-block">
          <div className="listing-block-head">
            <h2>{chapter.title}</h2>
            <Link to={`/gallery#${chapter.id}`} className="listing-link">
              {chapter.film ? (
                <>
                  <IconPlay size={11} /> Watch the film · {formatDuration(chapter.film.duration)}
                </>
              ) : (
                <>All photos</>
              )}
            </Link>
          </div>
          <p className="listing-block-lede">{chapter.summary}</p>
          <div className="listing-building-photos">
            {chapter.photos.slice(0, 4).map((p) => (
              <figure key={p.src}>
                <Photo src={p.src} alt={p.title} sizes={BLOCK_PHOTO_SIZES} />
                <figcaption>{p.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Gallery({ listing: l }: { listing: Listing }) {
  const [i, setI] = useState(0);
  const photos = l.photos;
  const n = photos.length;
  const step = (d: number) => setI((x) => (x + d + n) % n);
  const touchX = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % n);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);
  if (n === 0) return null;
  const p = photos[i];
  return (
    <div className="listing-gallery">
      <figure
        className="listing-gallery-main"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        }}
      >
        <img key={p.url} src={mediaUrl(p.url)} alt={`${l.unit}, photo ${i + 1} of ${n}`} width={p.width} height={p.height} fetchPriority="high" />
        {n > 1 && (
          <>
            <button type="button" className="listing-gallery-nav is-prev" onClick={() => step(-1)} aria-label="Previous photo">
              <IconChevronLeft size={22} />
            </button>
            <button type="button" className="listing-gallery-nav is-next" onClick={() => step(1)} aria-label="Next photo">
              <IconChevronRight size={22} />
            </button>
            <span className="listing-gallery-count">
              {i + 1} / {n}
            </span>
          </>
        )}
      </figure>
      {n > 1 && (
        <div className="listing-gallery-thumbs" role="group" aria-label="Photos">
          {photos.map((t, k) => (
            <button key={t.url} type="button" aria-pressed={k === i} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}>
              <img src={mediaUrl(t.url)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {/* warm the next photo so paging never waits */}
      {n > 1 && <link rel="prefetch" as="image" href={mediaUrl(photos[(i + 1) % n].url)} />}
    </div>
  );
}

/** Mounts its child (here the three.js plan) only once it scrolls near the viewport. */
function LazyWhenVisible({ children, minHeight }: { children: React.ReactNode; minHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <div ref={ref} style={shown ? undefined : { minHeight }}>
      {shown && children}
    </div>
  );
}
