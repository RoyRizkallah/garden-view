import { useMemo, useState } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import PageHero from '../components/PageHero';
import { IconArrowRight, IconImage, IconTag } from '../components/Icons';
import { formatSqm, useResidenceAreas, type UnitArea } from '../data/planAreas';
import { heroImage } from '../data/routeHeroes';
import { mediaUrl } from '../portal/api';
import {
  FURNISHED_LABEL,
  availabilityLabel,
  enquireHref,
  floorsLabel,
  kindLabel,
  priceLabel,
  usePublicListings,
  type Listing,
  type ListingType,
} from '../data/listings';
import '../styles/listings.css';

type TypeFilter = 'all' | ListingType;
type BlockFilter = 'all' | 'A' | 'B' | 'C';

const NONE: Listing[] = [];

export default function Listings() {
  const listings = usePublicListings();
  const [params] = useSearchParams();
  const [type, setType] = useState<TypeFilter>(() => {
    const t = params.get('type')?.toUpperCase();
    return t === 'SALE' || t === 'RENT' ? t : 'all';
  });
  const [block, setBlock] = useState<BlockFilter>('all');

  const all = listings.status === 'ready' ? listings.listings : NONE;
  const shown = all.filter((l) => (type === 'all' || l.type === type) && (block === 'all' || l.block === block));
  const count = (t: TypeFilter) => all.filter((l) => t === 'all' || l.type === t).length;
  const records = useMemo(() => all.flatMap((l) => (l.record ? [l.record] : [])), [all]);
  const areas = useResidenceAreas(records);

  // links from the first version of this page (?listing=<id>) go to the listing's own page
  const legacy = params.get('listing');
  if (legacy) return <Navigate to={`/listings/${encodeURIComponent(legacy)}`} replace />;

  return (
    <>
      <PageHero
        image={heroImage('/listings')}
        eyebrow="Availability"
        title={
          <>
            For Sale <span className="accent">&amp;</span> For Rent
          </>
        }
        subtitle="Homes at Garden View offered by their owners, each with its own photographs and 3D floor plan."
        height="short"
      />

      <section className="section section-dark listings-section">
        <div className="container">
          <div className="listings-toolbar">
            <div className="listings-tabs" role="group" aria-label="Show">
              {(['all', 'SALE', 'RENT'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                  {t === 'all' ? 'All' : t === 'SALE' ? 'For Sale' : 'For Rent'}
                  {listings.status === 'ready' && <small>{count(t)}</small>}
                </button>
              ))}
            </div>
            <div className="listings-blocks" role="group" aria-label="Block">
              {(['all', 'A', 'B', 'C'] as const).map((b) => (
                <button key={b} type="button" aria-pressed={block === b} onClick={() => setBlock(b)}>
                  {b === 'all' ? 'All blocks' : `Block ${b}`}
                </button>
              ))}
            </div>
          </div>

          {listings.status === 'loading' && (
            <div className="listings-grid" aria-busy="true" aria-label="Loading listings">
              {[0, 1, 2].map((i) => (
                <div key={i} className="listing-card is-skeleton" />
              ))}
            </div>
          )}

          {listings.status === 'error' && (
            <div className="listings-empty">
              <IconTag size={22} />
              <h2>Listings could not be loaded</h2>
              <p>Check your connection and try again.</p>
              <button type="button" className="btn btn-gold btn-sm" onClick={listings.retry}>
                Try Again
              </button>
            </div>
          )}

          {listings.status === 'ready' && all.length === 0 && (
            <div className="listings-empty">
              <IconTag size={22} />
              <h2>No homes are listed right now</h2>
              <p>
                Tell us what you are looking for and building management will let you know when a
                home at Garden View comes up for sale or rent.
              </p>
              <Link to="/location?interest=buying" className="btn btn-gold btn-sm">
                Register Your Interest <IconArrowRight size={14} />
              </Link>
              <p className="listings-empty-owner">
                Own a home here? <Link to="/login">Sign in to the resident portal</Link> to list it.
              </p>
            </div>
          )}

          {listings.status === 'ready' && all.length > 0 && shown.length === 0 && (
            <div className="listings-empty">
              <h2>Nothing matches these filters</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setType('all');
                  setBlock('all');
                }}
              >
                Show All Listings
              </button>
            </div>
          )}

          {shown.length > 0 && (
            <div className="listings-grid">
              {shown.map((l) => (
                <ListingCard key={l.id} listing={l} area={l.record ? areas.byCode.get(l.record.apartment) : undefined} />
              ))}
            </div>
          )}

          {all.length > 0 && (
            <p className="listings-footnote">
              Photographs and prices are provided by each owner. Areas are net internal floor space measured from the
              as-built plans, shown where every room of the home has been measured.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

export function ListingFacts({ listing: l, area }: { listing: Listing; area?: UnitArea }) {
  const available = availabilityLabel(l.availableFrom);
  const items: Array<[string, string]> = [];
  if (area?.complete && area.netSqm) items.push(['Interior', formatSqm(area.netSqm)]);
  if (area?.complete && area.outdoorSqm) items.push(['Balconies', formatSqm(area.outdoorSqm)]);
  if (available) items.push(['Availability', available.replace('Available ', '')]);
  if (l.furnished) items.push(['Furnishing', FURNISHED_LABEL[l.furnished]]);
  if (l.leaseDuration) items.push(['Lease', l.leaseDuration]);
  if (items.length === 0) return null;
  return (
    <dl className="listing-facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListingCard({ listing: l, area }: { listing: Listing; area?: UnitArea }) {
  const cover = l.photos[0];
  const href = `/listings/${encodeURIComponent(l.id)}`;
  return (
    <article className="listing-card">
      <Link to={href} className="listing-card-media" aria-label={`Residence ${l.unit}, ${priceLabel(l)}`}>
        {cover && <img src={mediaUrl(cover.url)} alt="" loading="lazy" decoding="async" width={cover.width} height={cover.height} />}
        <span className={`listing-badge is-${l.type.toLowerCase()}`}>{l.type === 'SALE' ? 'For Sale' : 'For Rent'}</span>
        {l.photos.length > 1 && (
          <span className="listing-photo-count">
            <IconImage size={13} /> {l.photos.length}
          </span>
        )}
      </Link>
      <div className="listing-card-body">
        <p className="listing-where">
          Block {l.block}
          {l.record && ` · ${floorsLabel(l.record.floors)}`}
        </p>
        <h2 className="listing-code">
          <Link to={href}>{l.unit}</Link>
        </h2>
        {l.record && <p className="listing-kind">{kindLabel(l)}</p>}
        <p className="listing-price">{priceLabel(l)}</p>
        <ListingFacts listing={l} area={area} />
        <div className="listing-actions">
          <Link to={href} className="btn btn-gold btn-sm">
            View Home
          </Link>
          <Link to={enquireHref(l)} className="listing-link">
            Enquire <IconArrowRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}
