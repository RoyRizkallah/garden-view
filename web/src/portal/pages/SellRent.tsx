import { useEffect, useState } from 'react';
import Photo from '../../components/Photo';
import ListingPanel from './ListingPanel';
import { api, type MyResidence } from '../api';
import { useAuth } from '../AuthContext';
import { IconTag } from '../../components/Icons';

const HERO_SIZES = '(max-width: 1080px) calc(100vw - 40px), calc(100vw - 384px)';

export default function SellRent() {
  const { account } = useAuth();
  const [data, setData] = useState<MyResidence | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<MyResidence>('/resident/residence')
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const unit = data?.unit;
  const block = unit?.block ?? account?.unit?.block ?? 'A';

  return (
    <div className="rs-page">
      <section className="rs-hero rs-hero-short">
        <Photo
          src={`/images/shoot/block-${block.toLowerCase()}-2.jpg`}
          alt=""
          sizes={HERO_SIZES}
          priority
        />
        <div className="rs-hero-scrim" />
        <div className="rs-hero-content">
          <p className="rs-hero-date">
            <IconTag size={14} /> Your home
          </p>
          <h1>Sell or rent.</h1>
          <p className="rs-hero-sub">
            {unit ? `Residence ${unit.number}` : 'Garden View'} · Listed on the building website with your
            photos and its 3D plan. Your name is never shown.
          </p>
        </div>
      </section>

      {error && (
        <div className="rs-note" style={{ marginTop: 16 }}>
          <IconTag size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="rs-listing-layout">
        {data && <ListingPanel unitCode={unit?.number ?? ''} listings={data.listingRequests} onChange={load} />}

        <aside className="rs-panel rs-help rs-listing-aside">
          <h2>Good to know</h2>
          <ul className="rs-help-list">
            <li>Your name, phone and email never appear on the public listing.</li>
            <li>Photos are resized automatically — no editing needed.</li>
            <li>Management reviews every listing before it goes live.</li>
            <li>You can take it down at any time, before or after it is live.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
