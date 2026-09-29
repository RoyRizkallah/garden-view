import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOOT_CHAPTERS, formatDuration, type ShootChapter, type ShootFilm } from '../data/photoshoot';
import { IconClose, IconChevronLeft, IconChevronRight, IconExpand, IconPlay } from '../components/Icons';
import Photo from '../components/Photo';

// Slot widths for `sizes` (1240 px container, 32 px side padding → 1176 px content). A chapter
// is a 12-column grid with 18 px gaps: the film spans 8 columns beside two stacked 4-column
// photos, then the rest sit in rows of three (4 columns) or two (6 columns). ≤ 900 px it drops
// to two columns (film full width), ≤ 560 px to one.
const SIZES = {
  third: '(max-width: 560px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 41px), (max-width: 1240px) 31vw, 380px',
  half: '(max-width: 560px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 41px), (max-width: 1240px) 47vw, 579px',
  // the film spans 8 of 12 columns (full width ≤ 900 px)
  film: '(max-width: 900px) calc(100vw - 64px), (max-width: 1240px) 64vw, 780px',
  // the lightbox image is capped at 1320 px inside 40 px of padding
  lightbox: 'min(1320px, calc(100vw - 80px))',
};

// Muted previews only play for people who haven't asked for less motion or less data.
function canAutoplay(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !conn?.saveData;
}

const posterFor = (film: ShootFilm) => film.poster.replace(/\.jpg$/, '-1440.webp');

type LightboxState = { chapter: number; index: number } | null;

export default function Gallery() {
  const [activeChapter, setActiveChapter] = useState(SHOOT_CHAPTERS[0].id);
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [theatre, setTheatre] = useState<number | null>(null);

  // Scroll-spy: the chapter crossing the middle band of the viewport is the current one.
  useEffect(() => {
    const sections = SHOOT_CHAPTERS.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveChapter(e.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Deep links like /gallery#fitness (from the Amenities page): the layout resets scroll on every
  // route change, so jump to the chapter once the page has laid out.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, []);

  const photoCount = SHOOT_CHAPTERS.reduce((n, c) => n + c.photos.length, 0);
  const filmCount = SHOOT_CHAPTERS.filter((c) => c.film).length;

  return (
    <>
      <section className="gallery-page shoot-page">
        <div className="container gallery-header">
          <div className="gallery-header-main">
            <p className="eyebrow">Gallery</p>
            <h1>
              A Visual Journey
              <br />
              Through <span className="accent">Garden View</span>
            </h1>
          </div>
          <div className="shoot-header-side">
            <p className="gallery-header-desc">
              Photography and film of each block, the fitness floor and pool, and the shared spaces
              and systems behind them.
            </p>
            <p className="shoot-header-count">
              <span>
                <strong>{photoCount}</strong> photographs
              </span>
              <span>
                <strong>{filmCount}</strong> films
              </span>
            </p>
          </div>
        </div>

        <nav className="shoot-nav" aria-label="Gallery chapters">
          <div className="container shoot-nav-inner">
            {SHOOT_CHAPTERS.map((c, i) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className={activeChapter === c.id ? 'is-active' : ''}
                aria-current={activeChapter === c.id ? 'true' : undefined}
              >
                <span className="shoot-nav-idx">{String(i + 1).padStart(2, '0')}</span>
                {c.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="container">
          {SHOOT_CHAPTERS.map((chapter, ci) => (
            <Chapter
              key={chapter.id}
              chapter={chapter}
              index={ci}
              onOpenPhoto={(index) => setLightbox({ chapter: ci, index })}
              onPlayFilm={() => setTheatre(ci)}
            />
          ))}
        </div>
      </section>

      {lightbox && <PhotoLightbox state={lightbox} onChange={setLightbox} />}
      {theatre !== null && SHOOT_CHAPTERS[theatre].film && (
        <FilmTheatre chapter={SHOOT_CHAPTERS[theatre]} onClose={() => setTheatre(null)} />
      )}
    </>
  );
}

function Chapter({
  chapter,
  index,
  onOpenPhoto,
  onPlayFilm,
}: {
  chapter: ShootChapter;
  index: number;
  onOpenPhoto: (index: number) => void;
  onPlayFilm: () => void;
}) {
  const { film, photos } = chapter;
  const beside = film ? photos.slice(0, 2) : [];
  const rest = film ? photos.slice(2) : photos;
  // rows of three; a count that would leave one straggler ends on a pair instead
  const pairsFrom = rest.length % 3 === 0 ? rest.length : rest.length % 3 === 2 ? rest.length - 2 : rest.length - 4;

  return (
    <section id={chapter.id} className="shoot-chapter" aria-labelledby={`${chapter.id}-title`}>
      <header className="shoot-chapter-head">
        <span className="shoot-chapter-idx" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="shoot-chapter-titles">
          <p className="shoot-chapter-kicker">{chapter.kicker}</p>
          <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
        </div>
        <p className="shoot-chapter-summary">{chapter.summary}</p>
        <ul className="shoot-chapter-facts">
          {chapter.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
          <li>
            {photos.length} photographs{film ? ` · ${formatDuration(film.duration)} film` : ''}
          </li>
        </ul>
      </header>

      <div className="shoot-grid">
        {film && <FilmTile film={film} title={chapter.title} onPlay={onPlayFilm} />}
        {beside.map((p, i) => (
          <PhotoTile key={p.src} photo={p} className="is-beside" sizes={SIZES.third} onOpen={() => onOpenPhoto(i)} />
        ))}
        {rest.map((p, i) => (
          <PhotoTile
            key={p.src}
            photo={p}
            className={i >= pairsFrom ? 'is-half' : 'is-third'}
            sizes={i >= pairsFrom ? SIZES.half : SIZES.third}
            onOpen={() => onOpenPhoto(beside.length + i)}
          />
        ))}
      </div>
    </section>
  );
}

function PhotoTile({
  photo,
  className,
  sizes,
  onOpen,
}: {
  photo: ShootChapter['photos'][number];
  className: string;
  sizes: string;
  onOpen: () => void;
}) {
  return (
    <button className={`shoot-tile ${className}`} onClick={onOpen} aria-label={`Open photo: ${photo.title}`}>
      <Photo src={photo.src} alt={photo.title} sizes={sizes} />
      <span className="shoot-tile-caption">
        <em>{photo.tag}</em>
        {photo.title}
      </span>
      <span className="shoot-tile-expand" aria-hidden="true">
        <IconExpand size={14} />
      </span>
    </button>
  );
}

function FilmTile({ film, title, onPlay }: { film: ShootFilm; title: string; onPlay: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);

  // The silent preview only downloads and plays while the tile is on screen.
  useEffect(() => {
    const v = ref.current;
    if (!v || !canAutoplay()) return;
    v.muted = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <button className="shoot-film" onClick={onPlay} aria-label={`Play the ${title} film, ${formatDuration(film.duration)}`}>
      {/* the still is a lazy, responsive <Photo> under the video rather than a poster attribute:
          browsers fetch every poster on arrival, at full size, whether it is on screen or not */}
      <Photo src={film.poster} alt="" sizes={SIZES.film} />
      <video
        ref={ref}
        src={film.loop}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="shoot-film-scrim" />
      <span className="shoot-film-play">
        <IconPlay size={22} />
      </span>
      <span className="shoot-film-label">
        <em>Film</em>
        {title}
        <span className="shoot-film-duration">{formatDuration(film.duration)}</span>
      </span>
    </button>
  );
}

// Esc to close, focus moved in on open and handed back on close, page scroll frozen meanwhile.
function useModal(onClose: () => void) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return closeRef;
}

function PhotoLightbox({ state, onChange }: { state: NonNullable<LightboxState>; onChange: (s: LightboxState) => void }) {
  const chapter = SHOOT_CHAPTERS[state.chapter];
  const photos = chapter.photos;
  const count = photos.length;
  const close = useCallback(() => onChange(null), [onChange]);
  const step = useCallback(
    (d: number) => onChange({ chapter: state.chapter, index: (state.index + d + count) % count }),
    [onChange, state.chapter, state.index, count],
  );
  const closeRef = useModal(close);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const photo = photos[state.index];
  const neighbours = [photos[(state.index + 1) % count], photos[(state.index - 1 + count) % count]];

  return (
    <div
      className="lightbox shoot-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${chapter.title} photographs`}
      onClick={(e) => e.target === e.currentTarget && close()}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
    >
      <div className="shoot-lightbox-top">
        <span className="shoot-lightbox-chapter">{chapter.title}</span>
        <span className="shoot-lightbox-counter">
          {String(state.index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
        <button ref={closeRef} className="shoot-lightbox-close" onClick={close} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <button className="lightbox-nav lightbox-prev" onClick={() => step(-1)} aria-label="Previous photo">
        <IconChevronLeft size={28} />
      </button>
      <figure className="lightbox-figure shoot-lightbox-figure" key={photo.src}>
        <Photo src={photo.src} alt={photo.title} sizes={SIZES.lightbox} eager />
        <figcaption>
          <em>{photo.tag}</em>
          {photo.title}
        </figcaption>
      </figure>
      <button className="lightbox-nav lightbox-next" onClick={() => step(1)} aria-label="Next photo">
        <IconChevronRight size={28} />
      </button>
      {/* warm the cache for the next and previous photo so arrowing through never waits */}
      <div className="shoot-preload" aria-hidden="true">
        {neighbours.map((p) => (
          <Photo key={p.src} src={p.src} alt="" sizes={SIZES.lightbox} eager />
        ))}
      </div>
    </div>
  );
}

function FilmTheatre({ chapter, onClose }: { chapter: ShootChapter; onClose: () => void }) {
  const film = chapter.film!;
  const closeRef = useModal(onClose);
  return (
    <div
      className="lightbox shoot-theatre"
      role="dialog"
      aria-modal="true"
      aria-label={`${chapter.title} film`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shoot-lightbox-top">
        <span className="shoot-lightbox-chapter">{chapter.title}</span>
        <span className="shoot-lightbox-counter">Film · {formatDuration(film.duration)}</span>
        <button ref={closeRef} className="shoot-lightbox-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <div className="shoot-theatre-frame">
        <video controls autoPlay playsInline poster={posterFor(film)}>
          {film.sources.map((s) => (
            <source key={s.src} src={s.src} media={s.media} type="video/mp4" />
          ))}
        </video>
      </div>
    </div>
  );
}
