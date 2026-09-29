import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import heroes from './src/data/routeHeroes.json' with { type: 'json' }
import media from './src/data/photoshoot-media.json' with { type: 'json' }

// Each route's first-screen photo is its LCP, but in a client-rendered app the browser only
// discovers it after the JavaScript has run (~1.5 s in on 4G). This writes a tiny inline script
// into <head> that looks at the URL and preloads that route's hero straight away, with exactly the
// srcset/sizes the page's <picture> uses so the response is reused rather than fetched twice.
// The list lives in src/data/routeHeroes.json, shared with the pages.
function preloadRouteHero(): Plugin {
  const photos = media.photos as unknown as Record<string, { v: [number, string][] }>
  const table: Record<string, [string, string]> = {}
  for (const [route, { photo, sizes }] of Object.entries(heroes.routes)) {
    const meta = photos[photo]
    if (!meta) throw new Error(`routeHeroes: no photo "${photo}" in photoshoot-media.json`)
    const srcset = meta.v.map(([w, suffix]) => `/images/shoot/${photo}-${suffix}.avif ${w}w`).join(', ')
    table[route] = [srcset, sizes === 'cover' ? heroes.coverSizes : sizes]
  }
  const script =
    `(function(){var t=${JSON.stringify(table)};` +
    `var p=location.pathname;while(p.length>1&&p.charAt(p.length-1)==='/')p=p.slice(0,-1);var r=t[p];if(!r)return;` +
    `var l=document.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';` +
    `l.setAttribute('imagesrcset',r[0]);l.setAttribute('imagesizes',r[1]);l.setAttribute('fetchpriority','high');` +
    `document.head.appendChild(l)})()`
  return {
    name: 'preload-route-hero',
    transformIndexHtml: () => [{ tag: 'script', children: script, injectTo: 'head-prepend' }],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloadRouteHero()],
  build: {
    // Defaults reviewed and kept on purpose:
    // - assetsInlineLimit (4 KiB): nothing imported from src/ is a binary asset;
    //   photos, logos, plans and fonts are all served from public/.
    // - modulePreload: Vite injects <link rel="modulepreload"> for the static
    //   chunks of the entry (vendor), so the first paint never waterfalls.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // three.js (+ its examples/jsm helpers) is only reached through the
            // lazy Explorer / FloorPlans routes, so this stays an async chunk.
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            // Resident portal and admin portal: one chunk each, loaded only
            // after sign-in (App.tsx lazy-imports every page in them).
            // includeDependenciesRecursively must be off here: otherwise the
            // shared modules these pages import (Icons, api, AuthContext...)
            // get captured too and the public entry ends up statically
            // importing the portal chunk.
            {
              name: 'portal',
              test: /[\\/]src[\\/]portal[\\/](pages[\\/]|PortalLayout\.tsx$)/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'admin',
              test: /[\\/]src[\\/]portal[\\/](admin[\\/]|AdminLayout\.tsx$)/,
              includeDependenciesRecursively: false,
            },
            // React runtime + router change far less often than app code:
            // keep them in a separately cacheable chunk.
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
