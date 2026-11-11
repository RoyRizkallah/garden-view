import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentInstallment, type HomeCharges, type Installment } from '../api';
import PageHeader from '../PageHeader';
import { IconArrowRight, IconCalendar, IconDocument, IconWallet } from '../../components/Icons';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * My charges: the home's maintenance for the year, as building management set it (the home's share
 * of the building, the year's total and its two half-year installments). What the money pays for
 * is on the Budget page.
 */
export default function Charges() {
  const [charges, setCharges] = useState<HomeCharges | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const current = currentInstallment(charges);
  const isCurrent = (installment: Installment) => installment === current;

  useEffect(() => {
    api
      .get<{ charges: HomeCharges | null }>('/resident/installments')
      .then((res) => setCharges(res.charges))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="rs-page">
      <PageHeader
        kicker="My charges"
        title="Charges"
        lede="Your home’s maintenance for the year, as set by building management, in two installments."
      />

      {error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>{error}</span>
        </div>
      )}

      {charges === undefined && !error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>Reading your charges…</span>
        </div>
      )}

      {charges === null && (
        <div className="rs-empty">
          <span className="rs-empty-icon">
            <IconWallet size={20} />
          </span>
          <h2>Your charges are not published yet</h2>
          <p>When building management sets this year’s maintenance for your home, it appears here.</p>
        </div>
      )}

      {charges && (
        <>
          <section className="rs-due ch-year" aria-labelledby="year-total">
            <div className="rs-due-main">
              <p className="rs-due-label" id="year-total">
                Maintenance {charges.year}
              </p>
              <p className="rs-due-amount">{dollars.format(charges.total)}</p>
              <p className="rs-due-meta">
                Your home’s share of the building: {charges.sharePerThousand} / 1000
              </p>
            </div>
            <div className="rs-due-how">
              <h2>How to pay</h2>
              <p>
                Arrange a bank transfer or hand your payment to building management. For a question about your
                charges, call the manager’s office.
              </p>
            </div>
          </section>

          <div className="ch-installments">
            {charges.installments.map((installment) => (
              <article key={installment.label} className={`ch-installment${isCurrent(installment) ? ' is-current' : ''}`}>
                <header>
                  <span className="ch-installment-name">{installment.label}</span>
                  {isCurrent(installment) && <span className="ch-now">This half</span>}
                </header>
                <strong>{dollars.format(installment.amount)}</strong>
                <span className="ch-period">
                  <IconCalendar size={13} /> {day(installment.from)} – {day(installment.to)} {charges.year}
                </span>
              </article>
            ))}
          </div>

          <Link to="/portal/budget" className="ch-budget-link">
            <span>
              <strong>What your charges pay for</strong>
              <span>The building’s {charges.year} budget, post by post</span>
            </span>
            <IconArrowRight size={16} />
          </Link>
        </>
      )}
    </div>
  );
}
