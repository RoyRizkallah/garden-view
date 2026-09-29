import heroes from './routeHeroes.json';

// Each route's first-screen photo (its LCP) and the `sizes` it is drawn at. One list for two
// readers: the pages render from it, and vite.config.ts writes a matching
// <link rel="preload" imagesrcset imagesizes> into index.html, so the browser starts the download
// while the JavaScript is still arriving instead of ~1.5 s later on a 4G link. The preload only
// reuses the response if srcset and sizes match the <picture> exactly — hence the shared source.
// The home page is left out on purpose: measured, preloading its opening still made the first
// paint later (it competes with the JavaScript and fonts), where on these pages it saves ~1 s.
export type HeroRoute = keyof typeof heroes.routes;

/** Full-bleed cover heroes are width-bound on landscape screens but height-bound on portrait ones
 * (a 92vh hero on a 390 px phone needs a ~1160 px-wide 3:2 source), so portrait asks for more. */
export const COVER_HERO_SIZES = heroes.coverSizes;

export const heroImage = (route: HeroRoute): string => `/images/shoot/${heroes.routes[route].photo}.jpg`;

export const heroSizes = (route: HeroRoute): string => {
  const s = heroes.routes[route].sizes;
  return s === 'cover' ? COVER_HERO_SIZES : s;
};
