import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { IconExpand } from './Icons';

// Centered on Beirut Central District / Martyrs' Square (33.8911 N, 35.5042 E) — the real,
// verifiable district the building is in. We don't have Garden View's exact street address yet,
// so this shows the district, not a fabricated precise pin — see the note on the Location page.
const LAT = 33.8911;
const LON = 35.5042;

// OpenStreetMap data from OpenFreeMap's light "Positron" style: free, with no key or account.
// MapLibre and the map data load only once the map scrolls near the viewport, so pages that
// never reach it pay nothing.
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

// the pin and label drawn at the district, moving with the map
const MARKER_HTML = `<span class="map-marker-pin"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></svg></span><span class="map-marker-label">Beirut Central District</span>`;

// Real Google Maps deep link to the same district coordinates as the map above.
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${LAT},${LON}`;

type LocationMapProps = {
  className?: string;
  showLink?: boolean;
};

export default function LocationMap({ className, showLink }: LocationMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let map: MapLibreMap | null = null;
    let cancelled = false;

    const build = async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled) return;
        map = new maplibregl.Map({
          container: node,
          style: STYLE,
          center: [LON, LAT],
          zoom: 14.5,
          minZoom: 11,
          maxZoom: 18,
          // the page scrolls past the map: plain wheel and one-finger drags stay with the page
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
        });
        map.touchZoomRotate.disableRotation();
        if (showLink) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        const marker = document.createElement('div');
        marker.className = 'map-marker';
        marker.innerHTML = MARKER_HTML;
        new maplibregl.Marker({ element: marker }).setLngLat([LON, LAT]).addTo(map);
        // on a phone-sized map the credits start folded behind their (i) button
        if (node.clientWidth < 420) {
          map.once('load', () => node.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
        }
        map.on('error', (e) => {
          // a failed style load leaves a blank map; a single missing tile is not worth a message
          if (!map?.isStyleLoaded() && /style/i.test(String(e.error?.message))) setFailed(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void build();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
      map?.remove();
    };
  }, [showLink]);

  return (
    <div className={`map-card ${className ?? ''}`}>
      <div ref={el} className="map-card-canvas" />
      {failed && <div className="map-card-fallback">The map could not be loaded.</div>}
      {showLink && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="map-card-link">
          <IconExpand size={13} /> View on Maps
        </a>
      )}
    </div>
  );
}
