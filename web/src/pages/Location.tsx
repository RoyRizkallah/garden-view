import { useState, type FormEvent } from 'react';
import {
  IconMapPin,
  IconMail,
  IconPhone,
  IconWhatsapp,
  IconCar,
  IconLeaf,
  IconBuilding,
  IconArrowRight,
} from '../components/Icons';
import LocationMap from '../components/LocationMap';
import { api, ApiError } from '../portal/api';

const DISTRICT_HIGHLIGHTS = [
  { icon: IconMapPin, title: 'Prime Address', description: "In Beirut Central District" },
  { icon: IconCar, title: 'Well Connected', description: "Central to Beirut's main roads" },
  { icon: IconLeaf, title: 'Green & Open', description: 'Landscaped courtyard and street greenery' },
  { icon: IconBuilding, title: 'Established District', description: "Beirut's central business core" },
];

export default function Location() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageLength, setMessageLength] = useState(0);

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
            Garden View is perfectly situated in Beirut Central District, Lebanon. Everything you
            need is just steps away — where culture, convenience, and connectivity come together.
          </p>

          <div className="location-photo">
            <img src="/images/exterior-09.jpg" alt="Garden View against the Beirut skyline" />
          </div>

          <div className="district-grid">
            {DISTRICT_HIGHLIGHTS.map((h) => (
              <div key={h.title} className="district-item">
                <span className="district-item-icon">
                  <h.icon size={16} />
                </span>
                <strong>{h.title}</strong>
                <span>{h.description}</span>
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
            <div className="location-aside">
              <IconMail size={20} />
              <div>
                <strong>Prefer another way?</strong>
                <span>Direct contact details are coming soon.</span>
              </div>
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
                  <select id="interest" name="interest" defaultValue="">
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

          <p className="location-contact-divider">Or contact us directly</p>
          <div className="contact-grid">
            <div className="contact-grid-item">
              <IconPhone size={18} />
              <strong>Call Us</strong>
              <span>Pending confirmation</span>
            </div>
            <div className="contact-grid-item">
              <IconMail size={18} />
              <strong>Email Us</strong>
              <span>Pending confirmation</span>
            </div>
            <div className="contact-grid-item">
              <IconWhatsapp size={18} />
              <strong>WhatsApp</strong>
              <span>Pending confirmation</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
