import { useEffect, useState } from 'react';
import Photo from '../../components/Photo';
import ListingPanel from './ListingPanel';
import { api, type MyResidence } from '../api';
import { IconTag } from '../../components/Icons';

export default function SellRent() {
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

  return (
    <div className="portal-page">
      <section className="portal-hero" style={{ minHeight: 150 }}>
        <Photo src="/images/shoot/block-a-2.jpg" alt="" sizes="100vw" />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            <IconTag size={14} />
            Your home
          </p>
          <h1>Sell or Rent</h1>
          <p className="portal-hero-sub">
            {unit ? `Unit ${unit.block}-${unit.number}` : 'Garden View'}
            {' · '}
            List it on the website with your photos and its 3D floor plan. Your name is never shown.
          </p>
        </div>
      </section>

      {error && <div className="note-card">{error}</div>}
      {data && <ListingPanel unitCode={unit?.number ?? ''} listings={data.listingRequests} onChange={load} />}
    </div>
  );
}
