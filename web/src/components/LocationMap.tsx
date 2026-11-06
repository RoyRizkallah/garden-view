import { IconExpand } from './Icons';

// Centered on Beirut Central District / Martyrs' Square (33.8911 N, 35.5042 E) — the real,
// verifiable district the building is in. We don't have Garden View's exact street address yet,
// so this shows the district, not a fabricated precise pin — see the note on the Location page.
const LAT = 33.8911;
const LON = 35.5042;

// Google Maps' plain embed: no API key or account, Google's own pin at the coordinates.
// (The keyed Embed API left the map blank in production when no key was set.)
const mapSrc = `https://maps.google.com/maps?q=${LAT},${LON}&z=15&hl=en&output=embed`;

// Real Google Maps deep link to the same district coordinates as the map above.
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${LAT},${LON}`;

type LocationMapProps = {
  className?: string;
  showLink?: boolean;
};

export default function LocationMap({ className, showLink }: LocationMapProps) {
  return (
    <div className={`map-card ${className ?? ''}`}>
      <iframe
        src={mapSrc}
        title="Map of Beirut Central District, where Garden View stands"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      {showLink && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="map-card-link">
          <IconExpand size={13} /> View on Maps
        </a>
      )}
    </div>
  );
}
