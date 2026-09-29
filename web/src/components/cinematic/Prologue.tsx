import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUILDING_FACTS } from '../../data/building';
import { IconArrowRight, IconLayers } from '../Icons';
import Photo, { COVER_HERO_SIZES } from '../Photo';
import type { BlockId, PrologueScene } from './prologueScene';
import './prologue.css';

/**
 * The landing page's opening: one pinned, scroll-driven sequence built from what the building
 * really has — the Block C film, the 3D model from the as-built drawings, the garden and pool
 * films. Scroll progress `p` (0–1 over the section) drives every layer, so scrolling back plays
 * it in reverse. Visitors who ask for reduced motion get the opening shot as a still hero.
 *
 *   0.00–0.10  the Block C film behind the title, letterboxed
 *   0.10–0.34  the film dissolves into the night model, which rises storey by storey
 *   0.34–0.56  the camera circles the blocks, naming each one
 *   0.56–0.67  it looks down into the courtyard garden… and cuts to the garden film
 *   0.72–0.85  …then to the pool on level B1
 *   0.85–1.00  back out to the whole building, every window lit
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Fades in over a→b, holds, fades out over c→d. */
const win = (p: number, a: number, b: number, c: number, d: number) => smooth(a, b, p) * (1 - smooth(c, d, p));

const CHAPTERS = [
  { label: 'Arrival', at: 0.0 },
  { label: 'The Building', at: 0.24 },
  { label: 'Three Blocks', at: 0.4 },
  { label: 'The Garden', at: 0.645 },
  { label: 'Below Ground', at: 0.785 },
  { label: 'Your Home', at: 0.96 },
];
const BLOCK_LABELS: Array<{ id: BlockId; units: number; at: [number, number, number, number] }> = [
  { id: 'A', units: 18, at: [0.35, 0.37, 0.415, 0.43] },
  { id: 'C', units: 17, at: [0.42, 0.44, 0.485, 0.5] },
  { id: 'B', units: 6, at: [0.49, 0.51, 0.55, 0.565] },
];

const film = (slug: string) => ({ src: `/media/${slug}-loop.mp4`, poster: `/images/shoot/film-${slug}-1440.webp` });

export default function Prologue() {
  const root = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layers = useRef<Record<string, HTMLElement | null>>({});
  const set = (key: string) => (el: HTMLElement | null) => {
    layers.current[key] = el;
  };
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const section = root.current!;
    const canvas = canvasRef.current!;
    const L = layers.current;
    const videos = ['film1', 'film2', 'film3'].map((k) => L[k]?.querySelector('video') ?? null);
    videos.forEach((v) => v && (v.muted = true));

    let scene: PrologueScene | null = null;
    let disposed = false;
    const lowPower = window.matchMedia('(max-width: 900px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;

    // The model loads after the opening film is on screen, so it never delays the first paint.
    const load = window.setTimeout(() => {
      import('./prologueScene')
        .then(({ createPrologueScene }) => createPrologueScene(canvas, { lowPower }))
        .then((s) => {
          if (disposed) return s.dispose();
          scene = s;
          const r = canvas.getBoundingClientRect();
          s.resize(r.width, r.height);
        })
        .catch(() => !disposed && setSceneFailed(true));
    }, 350);

    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(r.width, r.height);
    });
    ro.observe(canvas);

    const progress = () => {
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? clamp01(-r.top / span) : 0;
    };
    let p = progress();
    let raf = 0;
    let last = performance.now();
    let preloaded = false;
    let lastChapter = -1;
    const t0 = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const r = section.getBoundingClientRect();
      if (r.bottom < -50 || r.top > window.innerHeight + 50) return; // off screen: nothing to draw
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // ease toward the scroll position so a flick of the wheel reads as a camera move
      p += (progress() - p) * (1 - Math.exp(-dt * 7));

      const film1 = 1 - smooth(0.1, 0.16, p);
      const model = Math.max(win(p, 0.1, 0.16, 0.63, 0.67), smooth(0.8, 0.86, p));
      const film2 = win(p, 0.63, 0.67, 0.72, 0.755);
      const film3 = win(p, 0.72, 0.755, 0.8, 0.86);
      const style = (k: string, opacity: number, transform?: string) => {
        const el = L[k];
        if (!el) return;
        el.style.opacity = opacity.toFixed(3);
        el.style.visibility = opacity < 0.002 ? 'hidden' : 'visible';
        if (transform !== undefined) el.style.transform = transform;
      };
      style('film1', film1, `scale(${1.02 + smooth(0, 0.16, p) * 0.12})`);
      style('model', model);
      style('film2', film2, `scale(${1.08 - win(p, 0.63, 0.7, 2, 3) * 0.08})`);
      style('film3', film3, `scale(${1.06 - smooth(0.72, 0.84, p) * 0.06})`);

      // letterbox: the title card opens out as the scroll begins
      const bars = (1 - smooth(0.01, 0.1, p)) * 8;
      if (L.barTop) L.barTop.style.height = `${bars}vh`;
      if (L.barBottom) L.barBottom.style.height = `${bars}vh`;

      const lift = (a: number, b: number) => `translate3d(0, ${(1 - smooth(a, b, p)) * 26}px, 0)`;
      style('hero', 1 - smooth(0.04, 0.1, p), `translate3d(0, ${-smooth(0.02, 0.1, p) * 60}px, 0)`);
      style('c1', win(p, 0.17, 0.21, 0.3, 0.33), lift(0.17, 0.21));
      style('c2', win(p, 0.345, 0.37, 0.545, 0.57), lift(0.345, 0.37));
      style('c3', win(p, 0.585, 0.615, 0.705, 0.73), lift(0.585, 0.615));
      style('c4', win(p, 0.755, 0.775, 0.82, 0.845), lift(0.755, 0.775));
      style('c5', smooth(0.885, 0.93, p), lift(0.885, 0.93));
      style('cue', 1 - smooth(0.0, 0.03, p));
      for (const k of ['hero', 'c5']) {
        const el = L[k];
        if (el) el.style.pointerEvents = Number(el.style.opacity) > 0.6 ? 'auto' : 'none';
      }

      // films play only while they can be seen; the later ones start loading once the model is up
      [film1, film2, film3].forEach((o, i) => {
        const v = videos[i];
        if (!v) return;
        if (o > 0.01 && v.paused) v.play().catch(() => {});
        else if (o <= 0.01 && !v.paused) v.pause();
      });
      if (!preloaded && p > 0.3) {
        preloaded = true;
        videos.slice(1).forEach((v) => v && (v.preload = 'auto'));
      }

      if (scene && model > 0.002) {
        scene.frame(p, (now - t0) / 1000);
        for (const b of BLOCK_LABELS) {
          const el = L[`label-${b.id}`];
          if (!el) continue;
          const o = win(p, ...b.at);
          el.style.opacity = o.toFixed(3);
          el.style.visibility = o < 0.002 ? 'hidden' : 'visible';
          if (o > 0.002) {
            const pos = scene.project(b.id);
            // keep the label clear of the navbar and the caption when the crown is out of frame
            const y = Math.min(Math.max(pos.y, 170), window.innerHeight * 0.55);
            el.style.transform = `translate3d(${pos.x}px, ${y}px, 0) translate(-50%, -100%)`;
          }
        }
      }

      const ch = CHAPTERS.reduce((best, c, i) => (p + 0.02 >= c.at ? i : best), 0);
      if (ch !== lastChapter) {
        lastChapter = ch;
        setChapter(ch);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.clearTimeout(load);
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene?.dispose();
    };
  }, [reduced]);

  const goTo = (at: number) => {
    const section = root.current;
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const span = section.offsetHeight - window.innerHeight;
    // aim a little past the chapter's start so its caption is fully in
    window.scrollTo({ top: top + Math.min(1, at + (at > 0 ? 0.03 : 0)) * span, behavior: 'smooth' });
  };

  return (
    <section ref={root} className={`prologue${reduced ? ' is-still' : ''}`} aria-label="Garden View, introduced">
      <div className="prologue-stage">
        <div ref={set('film1')} className="pl-layer pl-film">
          <Photo src="/images/shoot/film-block-c.jpg" alt="Block C of Garden View from the street" sizes={COVER_HERO_SIZES} priority />
          {!reduced && <video src={film('block-c').src} muted loop playsInline autoPlay preload="auto" aria-hidden="true" />}
        </div>

        {!reduced && (
          <>
            <div ref={set('model')} className="pl-layer pl-model" style={{ opacity: 0, visibility: 'hidden' }}>
              <canvas ref={canvasRef} aria-hidden="true" />
              {sceneFailed && <Photo src="/images/shoot/block-a-1.jpg" alt="" sizes="100vw" />}
              {BLOCK_LABELS.map((b) => (
                <div key={b.id} ref={set(`label-${b.id}`)} className="pl-block-label" style={{ opacity: 0 }}>
                  <strong>Block {b.id}</strong>
                  <span>{b.units} residences</span>
                </div>
              ))}
            </div>
            <div ref={set('film2')} className="pl-layer pl-film" style={{ opacity: 0, visibility: 'hidden' }}>
              <img src={film('common').poster} alt="" />
              <video src={film('common').src} muted loop playsInline preload="none" aria-hidden="true" />
            </div>
            <div ref={set('film3')} className="pl-layer pl-film" style={{ opacity: 0, visibility: 'hidden' }}>
              <img src={film('gym').poster} alt="" />
              <video src={film('gym').src} muted loop playsInline preload="none" aria-hidden="true" />
            </div>
          </>
        )}

        <div className="pl-vignette" aria-hidden="true" />
        {!reduced && (
          <>
            <div ref={set('barTop')} className="pl-bar pl-bar-top" aria-hidden="true" />
            <div ref={set('barBottom')} className="pl-bar pl-bar-bottom" aria-hidden="true" />
          </>
        )}

        {/* the opening title */}
        <div ref={set('hero')} className="pl-caption pl-hero">
          <div className="container">
            <p className="eyebrow" style={{ color: '#e9e1cc' }}>
              {BUILDING_FACTS.location}
            </p>
            <h1 className="pl-title">
              Home at <span className="accent">Garden View</span>
            </h1>
            <p className="pl-sub">
              Three limestone blocks around a private garden. Forty-one residences in the heart of
              Beirut Central District.
            </p>
            <div className="pl-cta">
              <Link to="/residences" className="btn btn-gold">
                View Residences
                <IconArrowRight size={14} />
              </Link>
              <Link to="/explorer" className="btn btn-ghost">
                <IconLayers size={15} />
                Explore in 3D
              </Link>
            </div>
            <div className="pl-stats">
              <div>
                <strong>{BUILDING_FACTS.units}</strong>
                <span>Residences</span>
              </div>
              <div>
                <strong>{BUILDING_FACTS.blocks}</strong>
                <span>Blocks</span>
              </div>
              <div>
                <strong>G+10</strong>
                <span>Levels</span>
              </div>
            </div>
          </div>
        </div>

        {!reduced && (
          <>
            <div ref={set('c1')} className="pl-caption pl-scene" style={{ opacity: 0 }}>
              <div className="container">
                <p className="eyebrow">Built from the architect's drawings</p>
                <h2>Eleven storeys of limestone</h2>
                <p>The ground floor and ten above it, modelled from Garden View's as-built plans.</p>
              </div>
            </div>
            <div ref={set('c2')} className="pl-caption pl-scene" style={{ opacity: 0 }}>
              <div className="container">
                <p className="eyebrow">Three blocks</p>
                <h2>Forty-one residences</h2>
                <p>Blocks A, B and C, each with its own entrance and lobby.</p>
              </div>
            </div>
            <div ref={set('c3')} className="pl-caption pl-scene" style={{ opacity: 0 }}>
              <div className="container">
                <p className="eyebrow">Ground floor</p>
                <h2>A private garden at its heart</h2>
                <p>Two planted gardens set between the blocks.</p>
              </div>
            </div>
            <div ref={set('c4')} className="pl-caption pl-scene" style={{ opacity: 0 }}>
              <div className="container">
                <p className="eyebrow">Level B1</p>
                <h2>Below ground, a pool under a skylight</h2>
                <p>With the residents' fitness studio alongside.</p>
              </div>
            </div>
            <div ref={set('c5')} className="pl-caption pl-scene pl-final" style={{ opacity: 0, pointerEvents: 'none' }}>
              <div className="container">
                <p className="eyebrow">{BUILDING_FACTS.location}</p>
                <h2>
                  Find your home at <span className="accent">Garden View</span>
                </h2>
                <div className="pl-cta">
                  <Link to="/residences" className="btn btn-gold">
                    View Residences
                    <IconArrowRight size={14} />
                  </Link>
                  <Link to="/explorer" className="btn btn-ghost">
                    <IconLayers size={15} />
                    Explore in 3D
                  </Link>
                  <Link to="/gallery" className="btn btn-ghost">
                    Watch the Films
                  </Link>
                </div>
              </div>
            </div>

            <nav className="pl-rail" aria-label="Chapters of the introduction">
              {CHAPTERS.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  className={i === chapter ? 'is-active' : ''}
                  aria-current={i === chapter ? 'step' : undefined}
                  onClick={() => goTo(c.at)}
                >
                  <span>{c.label}</span>
                </button>
              ))}
            </nav>
            <div ref={set('cue')} className="pl-cue" aria-hidden="true">
              <span>Scroll</span>
              <i />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
