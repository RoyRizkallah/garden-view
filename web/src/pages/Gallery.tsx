import { useEffect, useMemo, useState } from 'react';
import { GALLERY_IMAGES, GALLERY_CATEGORIES } from '../data/building';
import { IconExpand, IconClose, IconChevronLeft, IconChevronRight, IconLeaf } from '../components/Icons';
import Photo from '../components/Photo';

// Slot widths for `sizes` (1240 px container, 32 px side padding): 4 columns with 18 px gaps,
// the featured item spanning 2; 2 columns ≤ 900 px (featured spanning both); 1 column ≤ 560 px.
// Rows are a fixed 200 px and the photos are object-fit: cover, so the 2-row featured slot
// (418 px tall) is height-bound for a 3:2 source below ~690 px wide → 626 px.
const SIZES = {
  featured: '(max-width: 690px) 626px, (max-width: 900px) calc(100vw - 64px), (max-width: 1240px) 47vw, 579px',
  tile: '(max-width: 560px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 41px), (max-width: 1240px) 23vw, 281px',
  // the lightbox figure is capped at 1100 px inside 40 px of padding
  lightbox: 'min(1100px, calc(100vw - 80px))',
};

export default function Gallery() {
  const [category, setCategory] = useState('all');
  const [active, setActive] = useState<number | null>(null);

  const filtered = useMemo(
    () => (category === 'all' ? GALLERY_IMAGES : GALLERY_IMAGES.filter((img) => img.category === category)),
    [category],
  );

  useEffect(() => {
    if (active === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null);
      if (e.key === 'ArrowRight') setActive((i) => (i === null ? i : (i + 1) % filtered.length));
      if (e.key === 'ArrowLeft') setActive((i) => (i === null ? i : (i - 1 + filtered.length) % filtered.length));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, filtered.length]);

  return (
    <>
      <section className="gallery-page">
        <div className="container gallery-header">
          <div className="gallery-header-main">
            <p className="eyebrow">Gallery</p>
            <h1>
              A Visual Journey
              <br />
              Through <span className="accent">Garden View</span>
            </h1>
          </div>
          <p className="gallery-header-desc">
            Exterior photography of the building. Interior, amenity, and professional
            photography will be added here as it becomes available.
          </p>
          <IconLeaf size={140} className="gallery-watermark" />
        </div>

        <div className="container gallery-controls">
          <div className="gallery-tabs">
            {GALLERY_CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={category === c.key ? 'is-active' : ''}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button className="lightbox-toggle" onClick={() => filtered.length > 0 && setActive(0)}>
            <IconExpand size={15} />
            Lightbox View
          </button>
        </div>

        <div className="container">
          {filtered.length === 0 ? (
            <div className="gallery-empty">
              No {GALLERY_CATEGORIES.find((c) => c.key === category)?.label.toLowerCase()} photos
              yet — check back soon.
            </div>
          ) : (
            <div className="bento-gallery">
              {filtered.map((img, i) => (
                <button
                  key={img.src}
                  className={`bento-gallery-item ${i === 0 ? 'is-featured' : ''}`}
                  onClick={() => setActive(i)}
                >
                  <Photo
                    src={img.src}
                    alt={img.caption}
                    sizes={i === 0 ? SIZES.featured : SIZES.tile}
                    eager={i === 0}
                  />
                  <span className="bento-gallery-expand">
                    <IconExpand size={14} />
                  </span>
                  <span className="bento-gallery-caption">
                    <em>{img.tag}</em>
                    {img.caption}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {active !== null && filtered[active] && (
        <div className="lightbox" role="dialog" aria-modal="true">
          <button className="lightbox-close" onClick={() => setActive(null)} aria-label="Close">
            <IconClose />
          </button>
          <button
            className="lightbox-nav lightbox-prev"
            onClick={() => setActive((i) => (i === null ? i : (i - 1 + filtered.length) % filtered.length))}
            aria-label="Previous image"
          >
            <IconChevronLeft size={28} />
          </button>
          <figure className="lightbox-figure">
            <Photo src={filtered[active].src} alt={filtered[active].caption} sizes={SIZES.lightbox} eager />
            <figcaption>
              {filtered[active].caption} — {active + 1} / {filtered.length}
            </figcaption>
          </figure>
          <button
            className="lightbox-nav lightbox-next"
            onClick={() => setActive((i) => (i === null ? i : (i + 1) % filtered.length))}
            aria-label="Next image"
          >
            <IconChevronRight size={28} />
          </button>
        </div>
      )}
    </>
  );
}
