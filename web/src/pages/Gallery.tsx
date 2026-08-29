import { useEffect, useMemo, useState } from 'react';
import { GALLERY_IMAGES, GALLERY_CATEGORIES } from '../data/building';
import { IconExpand, IconClose, IconChevronLeft, IconChevronRight, IconLeaf } from '../components/Icons';

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
                  <img src={img.src} alt={img.caption} loading="lazy" />
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
            <img src={filtered[active].src} alt={filtered[active].caption} />
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
