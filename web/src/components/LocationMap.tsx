import { IconMapPin, IconExpand } from './Icons';

// Centered on Beirut Central District / Martyrs' Square (33.8911 N, 35.5042 E) — the real,
// verifiable district the building is in. We don't have Garden View's exact street address yet,
// so this shows the district, not a fabricated precise pin — see the note on the Location page.
const LAT = 33.8911;
const LON = 35.5042;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// "view" mode (vs. "place") centers the map without Google's own place-info popup card,
// since we draw our own pin + label overlay on top instead.
const mapSrc = API_KEY
  ? `https://www.google.com/maps/embed/v1/view?key=${API_KEY}&center=${LAT},${LON}&zoom=15`
  : null;

// Real Google Maps deep link to the same district coordinates as the embed above.
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${LAT},${LON}`;

type LocationMapProps = {
  className?: string;
  showLink?: boolean;
};

export default function LocationMap({ className, showLink }: LocationMapProps) {
  return (
    <div className={`map-card ${className ?? ''}`}>
      {mapSrc ? (
        <iframe
          src={mapSrc}
          title="Garden View — Beirut Central District"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="map-card-fallback">Map unavailable — missing API key.</div>
      )}
      <div className="map-card-pin">
        <IconMapPin size={26} />
      </div>
      <div className="map-card-label">
        <span>Beirut Central District</span>
      </div>
      {showLink && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="map-card-link">
          <IconExpand size={13} /> View on Maps
        </a>
      )}
    </div>
  );
}
