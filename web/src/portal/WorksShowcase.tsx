import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { WORKS, WORK_GROUPS, workImage, type Work, type WorkGroup, type WorkPhoto } from '../data/works';
import { IconChevronLeft, IconChevronRight, IconClose } from '../components/Icons';

type Shot = { photo: WorkPhoto; caption: string };
const FILTERS = ['All', ...WORK_GROUPS] as const;
type Filter = 'All' | WorkGroup;

/** every photo of a work in viewing order, each with what it shows */
function shotsOf(work: Work): Shot[] {
  const where = (label?: string) => (label ? `${work.title} · ${label}` : work.title);
  return [
    ...work.pairs.flatMap((pair) => [
      { photo: pair.before, caption: `Before · ${where(pair.label)}` },
      { photo: pair.after, caption: `After · ${where(pair.label)}` },
    ]),
    ...work.more.map((photo) => ({ photo, caption: work.title })),
  ];
}

/** a photo in a card: opens the viewer at that photo */
function Thumb({ shot, tag, onOpen }: { shot: Shot; tag?: string; onOpen: () => void }) {
  return (
    <button type="button" className="wk-thumb" onClick={onOpen} aria-label={`Enlarge: ${shot.caption}`}>
      <img
        src={workImage(shot.photo, 640)}
        alt=""
        width={shot.photo.w}
        height={shot.photo.h}
        loading="lazy"
        decoding="async"
      />
      {tag && <span className={`wk-tag is-${tag.toLowerCase()}`}>{tag}</span>}
    </button>
  );
}

/** the enlarged photo, with the work's other photos one arrow away */
function Viewer({ shots, index, onIndex, onClose }: { shots: Shot[]; index: number; onIndex: (next: number) => void; onClose: () => void }) {
  const step = useCallback((by: number) => onIndex((index + by + shots.length) % shots.length), [index, onIndex, shots.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, step]);

  const shot = shots[index];
  // on the page itself, above the sidebar and everything else
  return createPortal(
    <div className="wk-viewer" role="dialog" aria-modal="true" aria-label={shot.caption} onClick={onClose}>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={workImage(shot.photo, 1600)} alt={shot.caption} width={shot.photo.w} height={shot.photo.h} />
        <figcaption>
          {shot.caption}
          <span>
            {index + 1} / {shots.length}
          </span>
        </figcaption>
      </figure>
      <button type="button" className="wk-viewer-close" onClick={onClose} aria-label="Close">
        <IconClose size={20} />
      </button>
      {shots.length > 1 && (
        <>
          <button
            type="button"
            className="wk-viewer-step is-prev"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            aria-label="Previous photo"
          >
            <IconChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="wk-viewer-step is-next"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            aria-label="Next photo"
          >
            <IconChevronRight size={22} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

/**
 * Works done on the building, before and after: one card per work, each pair side by side, with
 * any further photos below. Any photo opens large, with the work's other photos one arrow away.
 */
export default function WorksShowcase() {
  const [filter, setFilter] = useState<Filter>('All');
  const [open, setOpen] = useState<{ work: Work; index: number } | null>(null);
  const works = useMemo(() => (filter === 'All' ? WORKS : WORKS.filter((work) => work.group === filter)), [filter]);

  return (
    <section className="wk" aria-labelledby="works-title">
      <header className="wk-head">
        <div>
          <p className="wk-kicker">Done this year</p>
          <h2 id="works-title">Before and after</h2>
          <p className="wk-lede">
            Works carried out on the building, photographed by building management. Tap a photo to see it larger.
          </p>
        </div>
        <div className="rs-chip-row" role="group" aria-label="Show works">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? 'is-active' : ''}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <div className="wk-list">
        {works.map((work) => {
          const shots = shotsOf(work);
          const openAt = (index: number) => () => setOpen({ work, index });
          return (
            <article key={work.id} className="wk-card">
              <header>
                <div>
                  <h3>{work.title}</h3>
                  <p className="wk-meta">
                    {work.place} · {work.group}
                  </p>
                </div>
                <p className="wk-summary">{work.summary}</p>
              </header>

              <div className="wk-body">
              {work.pairs.length > 0 && (
                <div className="wk-pairs">
                  {work.pairs.map((pair, pairIndex) => (
                    <figure key={pair.before.slug} className="wk-pair">
                      <div className="wk-pair-photos">
                        <Thumb shot={shots[pairIndex * 2]} tag="Before" onOpen={openAt(pairIndex * 2)} />
                        <Thumb shot={shots[pairIndex * 2 + 1]} tag="After" onOpen={openAt(pairIndex * 2 + 1)} />
                      </div>
                      {pair.label && <figcaption>{pair.label}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}

              {work.more.length > 0 && (
                <div className={`wk-more${work.pairs.length === 0 ? ' is-main' : ''}`}>
                  {work.more.map((photo, moreIndex) => {
                    const index = work.pairs.length * 2 + moreIndex;
                    return <Thumb key={photo.slug} shot={shots[index]} onOpen={openAt(index)} />;
                  })}
                </div>
              )}
              </div>
            </article>
          );
        })}
      </div>

      {open && (
        <Viewer
          shots={shotsOf(open.work)}
          index={open.index}
          onIndex={(index) => setOpen({ work: open.work, index })}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
