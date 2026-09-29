import type { ImgHTMLAttributes } from 'react';
import shoot from '../data/photoshoot-media.json';

// Responsive photo: <picture> with the WebP variants of a professional-shoot photo
// (web/public/images/shoot/<name>-480/-960/-1440/-1920.webp) and its JPEG as the fallback <img>.
// scripts/build_media.py generates the files and records each photo's real size and variant widths
// in photoshoot-media.json; width descriptors are those real widths (variants are capped at the
// source width), and `w`/`h` go on the <img> so the browser knows the aspect ratio up front.
type Variant = readonly [width: number, suffix: string];
const PHOTOS: Record<string, { w: number; h: number; v: readonly Variant[] }> = {};
for (const [name, meta] of Object.entries(shoot.photos)) {
  PHOTOS[`shoot/${name}`] = { w: meta.w, h: meta.h, v: meta.v as unknown as Variant[] };
}

// Full-bleed, object-fit: cover heroes are width-bound on landscape screens but height-bound on
// portrait ones (a 92vh-tall hero on a 390 px phone needs a ~1160 px-wide 3:2 source to cover
// it), so in portrait we ask for the largest candidate rather than a 480 px one stretched 2.4×.
export const COVER_HERO_SIZES = '(orientation: portrait) 300vw, 100vw';

type PhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes' | 'loading'> & {
  /** JPEG path, e.g. "/images/shoot/gym-3.jpg". */
  src: string;
  /** The image's rendered CSS width for its layout slot (standard `sizes` syntax). */
  sizes: string;
  /** The page's LCP image: fetched eagerly with fetchPriority="high". */
  priority?: boolean;
  /** In the first viewport but not the LCP: eager, normal priority. Everything else lazy-loads. */
  eager?: boolean;
};

export default function Photo({ src, sizes, priority, eager, alt = '', ...rest }: PhotoProps) {
  const name = /\/images\/((?:shoot\/)?[^/]+)\.jpe?g$/.exec(src)?.[1];
  const meta = name ? PHOTOS[name] : undefined;
  const img = (
    <img
      src={src}
      alt={alt}
      width={meta?.w}
      height={meta?.h}
      loading={priority || eager ? undefined : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      {...rest}
    />
  );
  if (!meta) return img;
  const srcSet = meta.v.map(([w, suffix]) => `/images/${name}-${suffix}.webp ${w}w`).join(', ');
  return (
    // display: contents (layout.css) — the <picture> adds no box, so the <img> keeps sitting in
    // exactly the grid/flex/absolute slot it had before.
    <picture className="photo">
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      {img}
    </picture>
  );
}
