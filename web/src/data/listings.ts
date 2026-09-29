import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../portal/api';
import { matchResidence } from './useUnitPlan';
import { UNIT_KIND_LABEL, type UnitRecord } from './buildingExplorer';

// Residences for sale or rent. An owner lists their home from the resident portal with their own
// photos; it is public only while building management has it approved, and disappears the moment
// the owner takes it down. The API returns the terms, the owner's public description and photos,
// and the registered unit code — never the owner's name, contact details or private notes.

export type ListingType = 'SALE' | 'RENT';
export type Furnished = 'FURNISHED' | 'SEMI_FURNISHED' | 'UNFURNISHED';

export type PublicListing = {
  id: string;
  type: ListingType;
  askingPrice: number | null;
  availableFrom: string | null;
  leaseDuration: string | null;
  furnished: Furnished | null;
  description: string | null;
  /** The owner's photos, cover first; served by the API ("/uploads/..."), see mediaUrl(). */
  photos: { url: string; width: number; height: number }[];
  publishedAt: string;
  block: string;
  /** Registered code, e.g. "3 A1", "0/1 B". */
  unit: string;
};

/** A listing joined to the building registry (floors, kind); `record` is null for an unknown code. */
export type Listing = PublicListing & { record: UnitRecord | null };

export const FURNISHED_LABEL: Record<Furnished, string> = {
  FURNISHED: 'Furnished',
  SEMI_FURNISHED: 'Semi-furnished',
  UNFURNISHED: 'Unfurnished',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// The registry's kind labels carry their floors ("Penthouse duplex · 9–10"); listings show floors separately.
export const kindLabel = (l: Listing) => (l.record ? UNIT_KIND_LABEL[l.record.kind].split(' · ')[0] : '');

/** The enquiry form, pre-filled with this home ("I'm interested in residence 3 A1 (for sale)"). */
export const enquireHref = (l: Pick<PublicListing, 'type' | 'unit'>) =>
  `/location?${new URLSearchParams({ interest: l.type === 'SALE' ? 'buying' : 'renting', unit: l.unit })}`;

export function priceLabel(l: Pick<PublicListing, 'type' | 'askingPrice'>): string {
  if (l.askingPrice == null) return 'Price on request';
  return l.type === 'RENT' ? `${usd.format(l.askingPrice)} / month` : usd.format(l.askingPrice);
}

/** "Available now" once the date has passed, otherwise "Available 1 Nov 2026"; null when unset. */
export function availabilityLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getTime() <= Date.now()) return 'Available now';
  return `Available ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** "Level 3", "Levels 9 & 10", "Ground & Level 1". */
export function floorsLabel(floors: readonly number[]): string {
  const name = (f: number) => (f === 0 ? 'Ground' : String(f));
  if (floors.length === 1) return floors[0] === 0 ? 'Ground floor' : `Level ${floors[0]}`;
  if (floors[0] === 0) return `Ground & Level ${floors[1]}`;
  return `Levels ${floors.map(name).join(' & ')}`;
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; listings: Listing[] };

export function usePublicListings(): State & { retry: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api
      .get<{ listings: PublicListing[] }>('/public/listings')
      .then(({ listings }) => {
        if (!live) return;
        setState({
          status: 'ready',
          listings: listings.map((l) => ({ ...l, record: matchResidence(l.block, l.unit) })),
        });
      })
      .catch(() => live && setState({ status: 'error', message: 'Listings could not be loaded.' }));
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

type OneState = { status: 'loading' } | { status: 'gone'; message: string } | { status: 'error' } | { status: 'ready'; listing: Listing };

/** One listing for its own page; "gone" when it has been taken down or never went live. */
export function usePublicListing(id: string | undefined): OneState & { retry: () => void } {
  const [state, setState] = useState<OneState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setState({ status: 'loading' });
    api
      .get<{ listing: PublicListing }>(`/public/listings/${encodeURIComponent(id)}`)
      .then(({ listing }) => live && setState({ status: 'ready', listing: { ...listing, record: matchResidence(listing.block, listing.unit) } }))
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && /no longer available/i.test(err.message)) setState({ status: 'gone', message: err.message });
        else setState({ status: 'error' });
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
