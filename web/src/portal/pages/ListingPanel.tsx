import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { api, ApiError, mediaUrl, type Furnished, type ListingRequest, type ListingStatus, type ListingType } from '../api';
import { preparePhoto, PhotoPrepError, ACCEPTED_TYPES, type PreparedPhoto } from '../preparePhoto';
import { priceLabel, availabilityLabel, FURNISHED_LABEL } from '../../data/listings';
import { IconTag, IconHome, IconCheck, IconSofa, IconLamp, IconBox, IconImage, IconClose, IconArrowRight } from '../../components/Icons';

// Selling or renting out your home, from the resident's side: one listing at a time per home,
// with the owner's own photos. It goes live on the public For Sale & Rent page when building
// management approves it, and the owner can take it down whenever they like.

const MAX_PHOTOS = 12;
const OPEN: ListingStatus[] = ['PENDING', 'REVIEWING', 'APPROVED'];

const FURNISHED_OPTIONS: { value: Furnished; label: string; icon: typeof IconSofa }[] = [
  { value: 'FURNISHED', label: 'Furnished', icon: IconSofa },
  { value: 'SEMI_FURNISHED', label: 'Semi-furnished', icon: IconLamp },
  { value: 'UNFURNISHED', label: 'Unfurnished', icon: IconBox },
];
const LEASE_DURATIONS = ['6 months', '1 year', '2 years', 'Flexible'];

const CLOSED_LABEL: Partial<Record<ListingStatus, string>> = {
  DECLINED: 'Not approved',
  WITHDRAWN: 'Taken down',
};

type Props = {
  unitCode: string;
  listings: ListingRequest[];
  onChange: () => void;
};

export default function ListingPanel({ unitCode, listings, onChange }: Props) {
  const open = listings.find((l) => OPEN.includes(l.status));
  const past = listings.filter((l) => !OPEN.includes(l.status));
  return (
    <div className="lm">
      {open ? <ListingStatusCard listing={open} onChange={onChange} /> : <ListingForm unitCode={unitCode} onSubmitted={onChange} />}
      {past.length > 0 && (
        <div className="lm-history">
          <h3>Earlier listings</h3>
          <ul>
            {past.map((l) => (
              <li key={l.id}>
                <span>
                  {l.type === 'SALE' ? 'For sale' : 'For rent'} · {priceLabel(l)}
                </span>
                <span className="lm-history-meta">
                  {CLOSED_LABEL[l.status]} · {new Date(l.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- a listing in progress ---------- */

function ListingStatusCard({ listing: l, onChange }: { listing: ListingRequest; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = l.status === 'APPROVED';
  const step = l.status === 'PENDING' ? 0 : l.status === 'REVIEWING' ? 1 : 2;
  const steps = ['Submitted', 'Under review', 'Live on the website'];

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/resident/listing-requests/${l.id}/withdraw`);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not take the listing down. Please try again.');
      setBusy(false);
    }
  }

  const available = availabilityLabel(l.availableFrom);
  return (
    <div className={`lm-card${live ? ' is-live' : ''}`}>
      <ol className="lm-steps" aria-label="Listing progress">
        {steps.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-current' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="lm-step-dot">{i < step || (live && i === step) ? <IconCheck size={12} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <p className="lm-status-line">
        {live
          ? 'Your listing is live on the public For Sale & Rent page.'
          : 'Building management will review your listing before it goes on the website. You will see it change here.'}
      </p>

      {l.photos.length > 0 && (
        <div className="lm-photos-strip">
          {l.photos.map((p, i) => (
            <figure key={p.id}>
              <img src={mediaUrl(p.url)} alt={`Listing photo ${i + 1}`} loading="lazy" />
              {i === 0 && <span className="lm-cover">Cover</span>}
            </figure>
          ))}
        </div>
      )}

      <dl className="lm-terms">
        <div>
          <dt>Listing</dt>
          <dd>{l.type === 'SALE' ? 'For sale' : 'For rent'}</dd>
        </div>
        <div>
          <dt>{l.type === 'SALE' ? 'Asking price' : 'Monthly rent'}</dt>
          <dd>{priceLabel(l)}</dd>
        </div>
        {available && (
          <div>
            <dt>Availability</dt>
            <dd>{available.replace('Available ', '')}</dd>
          </div>
        )}
        {l.furnished && (
          <div>
            <dt>Furnishing</dt>
            <dd>{FURNISHED_LABEL[l.furnished]}</dd>
          </div>
        )}
        {l.leaseDuration && (
          <div>
            <dt>Lease</dt>
            <dd>{l.leaseDuration}</dd>
          </div>
        )}
      </dl>
      {l.description && (
        <div className="lm-text">
          <p className="lm-text-label">Description on the website</p>
          <p>{l.description}</p>
        </div>
      )}
      {l.notes && (
        <div className="lm-text">
          <p className="lm-text-label">Your note to building management (private)</p>
          <p>{l.notes}</p>
        </div>
      )}

      {error && <div className="note-card">{error}</div>}
      <div className="lm-actions">
        {live && (
          <a className="btn btn-primary btn-sm" href={`/listings?listing=${encodeURIComponent(l.id)}`} target="_blank" rel="noreferrer">
            View on the website <IconArrowRight size={13} />
          </a>
        )}
        {confirming ? (
          <div className="lm-confirm" role="alert">
            <span>{live ? 'Take this listing off the website now?' : 'Withdraw this listing request?'}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>
              {busy ? 'Taking down…' : live ? 'Take it down' : 'Withdraw'}
            </button>
          </div>
        ) : (
          <button type="button" className="lm-link" onClick={() => setConfirming(true)}>
            {live ? 'Take down listing (sold, let, or changed your mind)' : 'Withdraw request'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- a new listing ---------- */

function ListingForm({ unitCode, onSubmitted }: { unitCode: string; onSubmitted: () => void }) {
  const [type, setType] = useState<ListingType>('SALE');
  const [furnished, setFurnished] = useState<Furnished | null>(null);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descLength, setDescLength] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | File[]) {
    const list = [...files].slice(0, MAX_PHOTOS - photos.length);
    const skipped = files.length - list.length;
    if (list.length === 0) return;
    const errors: string[] = skipped > 0 ? [`Only ${MAX_PHOTOS} photos can be added; ${skipped} ${skipped === 1 ? 'was' : 'were'} left out.`] : [];
    setPreparing({ done: 0, total: list.length });
    for (const [i, file] of list.entries()) {
      try {
        const p = await preparePhoto(file);
        setPhotos((prev) => [...prev, p]);
      } catch (err) {
        errors.push(err instanceof PhotoPrepError ? err.message : `"${file.name}" could not be added.`);
      }
      setPreparing({ done: i + 1, total: list.length });
    }
    setPreparing(null);
    setPhotoErrors(errors);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  const makeCover = (key: string) => setPhotos((prev) => [prev.find((p) => p.key === key)!, ...prev.filter((p) => p.key !== key)]);
  const remove = (key: string) => setPhotos((prev) => prev.filter((p) => p.key !== key));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (photos.length === 0) {
      setError('Add at least one photo of your home. Listings are only shown with the owner’s own photos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/resident/listing-requests', {
        type,
        askingPrice: form.get('askingPrice') ? Number(form.get('askingPrice')) : undefined,
        availableFrom: form.get('availableFrom') || undefined,
        leaseDuration: type === 'RENT' ? form.get('leaseDuration') || undefined : undefined,
        furnished: furnished ?? undefined,
        description: String(form.get('description') ?? '').trim() || undefined,
        notes: String(form.get('notes') ?? '').trim() || undefined,
        photos: photos.map(({ dataUrl, width, height }) => ({ dataUrl, width, height })),
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your listing. Please try again.');
      setSubmitting(false);
    }
  }

  const totalMb = photos.reduce((n, p) => n + p.bytes, 0) / 1024 / 1024;

  return (
    <div className="portal-request-panel lm-form-panel">
      <ol className="lm-how">
        <li>
          <strong>Add photos and your terms</strong>
          <span>Photos of your own home, the price and when it is available.</span>
        </li>
        <li>
          <strong>Building management reviews it</strong>
          <span>You can follow its progress here.</span>
        </li>
        <li>
          <strong>It goes live on the website</strong>
          <span>On the public For Sale &amp; Rent page, with your home’s 3D floor plan. Your name and contact details are never shown.</span>
        </li>
      </ol>

      <div className="portal-type-toggle">
        <button type="button" className={type === 'SALE' ? 'is-active' : ''} onClick={() => setType('SALE')}>
          <IconTag size={16} /> For Sale
        </button>
        <button type="button" className={type === 'RENT' ? 'is-active' : ''} onClick={() => setType('RENT')}>
          <IconHome size={16} /> For Rent
        </button>
      </div>

      <form className="portal-inline-form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label>
            Photos of your home <span className="lm-req">required</span>
          </label>
          <div
            className={`lm-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {photos.length > 0 && (
              <ul className="lm-thumbs">
                {photos.map((p, i) => (
                  <li key={p.key}>
                    <img src={p.dataUrl} alt={`Photo ${i + 1}`} />
                    {i === 0 ? (
                      <span className="lm-cover">Cover</span>
                    ) : (
                      <button type="button" className="lm-make-cover" onClick={() => makeCover(p.key)}>
                        Make cover
                      </button>
                    )}
                    <button type="button" className="lm-remove" onClick={() => remove(p.key)} aria-label={`Remove photo ${i + 1}`}>
                      <IconClose size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className="lm-drop-cta" onClick={() => input.current?.click()} disabled={!!preparing}>
                <IconImage size={20} />
                <span>
                  {preparing
                    ? `Preparing ${preparing.done + 1 > preparing.total ? preparing.total : preparing.done + 1} of ${preparing.total}…`
                    : photos.length
                      ? 'Add more photos'
                      : 'Drag photos here, or choose from your device'}
                </span>
                <small>
                  {photos.length}/{MAX_PHOTOS} · living rooms, bedrooms, kitchen, balcony and view work best
                </small>
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {photos.length > 0 && (
            <p className="lm-hint">
              The first photo is the cover. Photos are resized before upload ({totalMb.toFixed(1)} MB in total) and their
              location data is removed.
            </p>
          )}
          {photoErrors.map((m) => (
            <p key={m} className="lm-error">
              {m}
            </p>
          ))}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="askingPrice">{type === 'SALE' ? 'Asking price (US$)' : 'Monthly rent (US$)'}</label>
            <div className="portal-input-prefixed">
              <span>$</span>
              <input id="askingPrice" name="askingPrice" type="number" min={0} step={type === 'SALE' ? 1000 : 50} placeholder="Leave empty for “price on request”" />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="availableFrom">Available from</label>
            <input id="availableFrom" name="availableFrom" type="date" />
          </div>
        </div>

        {type === 'RENT' && (
          <div className="form-field">
            <label htmlFor="leaseDuration">Lease duration</label>
            <select id="leaseDuration" name="leaseDuration" defaultValue="">
              <option value="">Not specified</option>
              {LEASE_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-field">
          <label>Furnishing</label>
          <div className="portal-furnished-toggle">
            {FURNISHED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={furnished === opt.value ? 'is-active' : ''}
                onClick={() => setFurnished(furnished === opt.value ? null : opt.value)}
              >
                <opt.icon size={16} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <div className="lm-label-row">
            <label htmlFor="description">Description for the website</label>
            <span className="lm-count">{descLength} / 1200</span>
          </div>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={1200}
            placeholder={`What makes ${unitCode} special: the layout, the light, recent renovations, the view…`}
            onChange={(e) => setDescLength(e.target.value.length)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="notes">Private note to building management</label>
          <textarea id="notes" name="notes" rows={2} maxLength={2000} placeholder="Best times to arrange viewings, anything we should know… (not shown on the website)" />
        </div>

        {error && <div className="note-card">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={submitting || !!preparing}>
          {submitting ? `Uploading ${photos.length} photo${photos.length === 1 ? '' : 's'}…` : 'Submit for review'}
        </button>
      </form>
    </div>
  );
}
