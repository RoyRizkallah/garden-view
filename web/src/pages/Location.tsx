import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconMapPin,
  IconCar,
  IconLeaf,
  IconBuilding,
  IconArrowRight,
} from '../components/Icons';
import LocationMap from '../components/LocationMap';
import { contactItems } from '../components/contactItems';
import Photo from '../components/Photo';
import { api, ApiError } from '../portal/api';
import { heroImage, heroSizes } from '../data/routeHeroes';


const DISTRICT_HIGHLIGHTS = [
  { icon: IconMapPin, title: 'Prime Address', description: "Beirut's historic city centre" },
  { icon: IconLeaf, title: 'Green & Open', description: 'Two private gardens and planted balconies' },
  { icon: IconCar, title: 'Private Parking', description: '120 spaces on three levels below ground' },
  { icon: IconBuilding, title: 'Three Blocks', description: '41 residences, each block with its own lobby' },
];

const INTERESTS = ['buying', 'renting', 'tour', 'other'];
const directContact = contactItems(18);

export default function Location() {
  // "Enquire" on a listing lands here as ?interest=buying&unit=3%20A1
  const [params] = useSearchParams();
  const presetInterest = INTERESTS.includes(params.get('interest') ?? '') ? params.get('interest')! : '';
  const presetUnit = params.get('unit')?.slice(0, 20) ?? '';
  const presetMessage = presetUnit
    ? `I'm interested in residence ${presetUnit}${presetInterest === 'renting' ? ' (for rent)' : presetInterest === 'buying' ? ' (for sale)' : ''}. `
    : '';
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageLength, setMessageLength] = useState(presetMessage.length);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/public/inquiries', {
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone') || undefined,
        interest: form.get('interest') || undefined,
        message: form.get('message'),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="location-split">
      <div className="location-split-panel location-split-dark">
        <div className="location-split-inner">
          <p className="eyebrow" style={{ color: '#cdbf9e' }}>
            <IconMapPin size={13} />
            Location
          </p>
          <h1 className="location-heading">
            In the Heart of
            <br />
            <span className="accent">Beirut Central District</span>
          </h1>
          <p className="location-split-copy">
            Garden View stands in Beirut Central District, the city's historic centre: three
            limestone blocks set around private gardens, among the district's landmark towers.
          </p>

          <figure className="location-photo">
            <Photo
              src={heroImage('/location')}
              alt="Block C among the trees of Beirut Central District"
              sizes={heroSizes('/location')}
              priority
            />
            <figcaption>Block C from the street</figcaption>
          </figure>

          <div className="district-grid">
            {DISTRICT_HIGHLIGHTS.map((h) => (
              <div key={h.title} className="district-item">
                <span className="district-item-icon">
                  <h.icon size={16} />
                </span>
                <div>
                  <strong>{h.title}</strong>
                  <span>{h.description}</span>
                </div>
              </div>
            ))}
          </div>

          <LocationMap className="map-card-large" showLink />
        </div>
      </div>

      <div className="location-split-panel location-split-light">
        <div className="location-split-inner">
          <div className="location-form-header">
            <div>
              <p className="eyebrow">Inquire</p>
              <h2>Request a Tour or More Information</h2>
              <p className="location-intro">
                Fill out the form below and our team will get back to you shortly with all the
                details.
              </p>
            </div>
          </div>

          {submitted ? (
            <div className="note-card" style={{ marginTop: 24 }}>
              Thanks — your inquiry has been sent to building management. We'll get back to you
              soon.
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="name">Full Name</label>
                  <input id="name" name="name" type="text" placeholder="Your full name" required />
                </div>
                <div className="form-field">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" name="email" type="email" placeholder="you@example.com" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="phone">Phone Number</label>
                  <input id="phone" name="phone" type="tel" placeholder="+961 XX XXX XXX" />
                </div>
                <div className="form-field">
                  <label htmlFor="interest">I'm interested in</label>
                  <select id="interest" name="interest" defaultValue={presetInterest}>
                    <option value="" disabled>
                      Select an option
                    </option>
                    <option value="buying">Buying a residence</option>
                    <option value="renting">Renting a residence</option>
                    <option value="tour">Scheduling a tour</option>
                    <option value="other">Other inquiry</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <div className="location-message-label">
                  <label htmlFor="message">Tell us more</label>
                  <span className="location-char-count">{messageLength} / 500</span>
                </div>
                <textarea
                  id="message"
                  name="message"
                  rows={2}
                  maxLength={500}
                  placeholder="Share any details or questions…"
                  defaultValue={presetMessage}
                  onChange={(e) => setMessageLength(e.target.value.length)}
                  required
                />
              </div>
              {error && <div className="note-card">{error}</div>}
              <button type="submit" className="btn btn-primary btn-block btn-sm" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send Inquiry'}
                <IconArrowRight size={16} />
              </button>
            </form>
          )}

          {directContact.length > 0 && (
            <>
              <p className="location-contact-divider">Or contact us directly</p>
              <div className="contact-grid">
                {directContact.map((c) => {
                  const body = (
                    <>
                      {c.icon}
                      <strong>{c.label}</strong>
                      <span>{c.value}</span>
                    </>
                  );
                  return c.href ? (
                    <a key={c.key} className="contact-grid-item" href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel="noreferrer">
                      {body}
                    </a>
                  ) : (
                    <div key={c.key} className="contact-grid-item">
                      {body}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
