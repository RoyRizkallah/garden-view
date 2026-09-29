import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Photo from '../../components/Photo';
import { api, ApiError, type Furnished, type ListingType, type ListingStatus, type MyResidence } from '../api';
import type { FloorPlan3DHandle } from '../../components/FloorPlan3D';
import type { PlanLevelId } from '../../data/floorPlans';
import { floorLabel, UNIT_KIND_LABEL } from '../../data/buildingExplorer';
import {
  matchResidence,
  planOutlinesResidence,
  planTagsResidence,
  residenceLevels,
  useUnitPlan,
  type ParkingTag,
} from '../../data/useUnitPlan';
import { AREA_SOURCE_NOTE, formatSqm, useUnitArea } from '../../data/planAreas';
import {
  IconLayers,
  IconImage,
  IconTag,
  IconCheck,
  IconHome,
  IconSofa,
  IconLamp,
  IconBox,
  IconCar,
  IconArrowRight,
} from '../../components/Icons';

// three.js and the model builder only load once a resident's plan is actually shown.
const FloorPlan3D = lazy(() => import('../../components/FloorPlan3D'));

/** The as-built survey the drawing set records. */
const SURVEY_YEAR = 2010;

const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  PENDING: 'Pending Review',
  REVIEWING: 'Under Review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
};

const FURNISHED_OPTIONS: { value: Furnished; label: string; icon: typeof IconSofa }[] = [
  { value: 'FURNISHED', label: 'Furnished', icon: IconSofa },
  { value: 'SEMI_FURNISHED', label: 'Semi-furnished', icon: IconLamp },
  { value: 'UNFURNISHED', label: 'Unfurnished', icon: IconBox },
];

const LEASE_DURATIONS = ['6 months', '1 year', '2 years', 'Flexible'];

const UNMATCHED_COPY = 'Your floor plan will appear here once your residence is matched to the plan set.';

/* ---------- My Floor Plan ---------- */

type ParkingChip = { key: string; levelId: PlanLevelId; label: string };

/** One chip per kind per basement: "B1 · Bay", "B2 · 2 Bays", "B3 · Storage". */
function parkingChips(tags: ParkingTag[]): ParkingChip[] {
  const chips: ParkingChip[] = [];
  for (const tag of tags) {
    const { level } = tag;
    if (tag.bays > 0) {
      chips.push({
        key: `${level.id}-bay`,
        levelId: level.id,
        label: `${level.short} · ${tag.bays === 1 ? 'Bay' : `${tag.bays} Bays`}`,
      });
    }
    if (tag.storage > 0) {
      chips.push({
        key: `${level.id}-storage`,
        levelId: level.id,
        label: `${level.short} · ${tag.storage === 1 ? 'Storage' : `${tag.storage} Storage`}`,
      });
    }
  }
  return chips;
}

type ResidencePlanProps = {
  unit: MyResidence['unit'];
};

function ResidencePlan({ unit }: ResidencePlanProps) {
  const { residence, levels, level, selectLevel, plan, loading, missing, parking } = useUnitPlan(
    unit.block,
    unit.number,
  );
  // The lazy viewer's handle arrives through a callback ref, so effects can wait on it.
  const [viewer, setViewer] = useState<FloorPlan3DHandle | null>(null);

  const code = residence?.apartment ?? null;
  const stagePlan = missing ? undefined : plan;
  /** Does the sheet on the stage carry this residence anywhere the viewer can frame? */
  const tagged = useMemo(() => (stagePlan && code ? planTagsResidence(stagePlan, code) : false), [stagePlan, code]);
  /** Does the sheet outline the residence's rooms (so the viewer lights its footprint), or list it as a pin only? */
  const outlined = useMemo(
    () => (stagePlan && code ? planOutlinesResidence(stagePlan, code) : false),
    [stagePlan, code],
  );
  // Measured from the as-built plan models; a total exists only when every level the residence spans is complete.
  const area = useUnitArea(residence);

  // Once a model is on the stage, fly to the residence when the sheet tags it; otherwise just
  // clear any selection carried over from the previous level. The viewer rebuilds the model in
  // its own effect first (children's effects run before the parent's), so the code is framable here.
  useEffect(() => {
    if (!viewer || !stagePlan || !code) return;
    viewer.focusApartment(tagged ? code : null);
  }, [viewer, stagePlan, code, tagged]);

  const chips = useMemo(() => (parking.status === 'ready' ? parkingChips(parking.tags) : []), [parking]);

  if (!residence || !level) return null;

  const onBasement = level.kind === 'parking';
  const showLevelToggle = levels.length > 1 || chips.length > 0;
  const goToLevel = (id: PlanLevelId) => {
    if (id === level.id) {
      // already on the sheet: re-frame the residence rather than doing nothing
      if (code && viewer && tagged) viewer.focusApartment(code);
      return;
    }
    selectLevel(id);
  };

  return (
    <section className="portal-plan" aria-labelledby="portal-plan-title">
      <div className="portal-plan-head">
        <div>
          <p className="portal-plan-kicker">{UNIT_KIND_LABEL[residence.kind]}</p>
          <h2 id="portal-plan-title" className="portal-plan-title">
            Residence {residence.apartment}
          </h2>
          <p className="portal-plan-sub">
            Block {residence.block} ·{' '}
            {levels.map((l) => (typeof l.floor === 'number' ? floorLabel(l.floor) : l.label)).join(' & ')}
          </p>
          {area?.complete && area.netSqm !== undefined && (
            <p className="portal-plan-area">
              <strong>{formatSqm(area.netSqm)}</strong> net
              {levels.length > 1 &&
                ` across ${levels.map((l) => (typeof l.floor === 'number' ? floorLabel(l.floor) : l.label)).join(' & ')}`}
              {area.outdoorSqm !== undefined && area.outdoorSqm > 0 && (
                <>
                  {' · '}
                  <strong>{formatSqm(area.outdoorSqm)}</strong>{' '}
                  {residence.kind === 'garden-duplex' ? 'terraces & gardens' : 'terraces & balconies'}
                </>
              )}
              <small> · {AREA_SOURCE_NOTE}</small>
            </p>
          )}
        </div>
        {showLevelToggle && (
          <div className="portal-plan-levels" role="group" aria-label="Level">
            {levels.map((l) => {
              const selected = l.id === level.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`portal-plan-level${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => goToLevel(l.id)}
                >
                  {typeof l.floor === 'number' ? floorLabel(l.floor) : l.label}
                </button>
              );
            })}
            {onBasement && (
              <span className="portal-plan-level is-selected is-basement" aria-current="true">
                {level.short}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="portal-plan-stage" aria-busy={loading}>
        {stagePlan ? (
          <Suspense fallback={<div className="portal-plan-fallback" />}>
            <FloorPlan3D
              ref={setViewer}
              plan={stagePlan}
              levelLabel={level.label}
              levelKind={level.kind}
            />
          </Suspense>
        ) : missing ? (
          <div className="portal-plan-empty">
            <span className="portal-plan-empty-icon">
              <IconLayers size={20} />
            </span>
            <p className="portal-plan-empty-title">{level.label} plan</p>
            <p className="portal-plan-empty-line">
              This sheet is being prepared for the web from the as-built drawing set.
            </p>
          </div>
        ) : (
          <div className="portal-plan-fallback" />
        )}

        <div className="portal-plan-stage-head">
          <span className="portal-plan-sheet">
            {level.label} · Sheet {level.sheet} · as-built {SURVEY_YEAR}
          </span>
        </div>

        <div className="portal-plan-controls" role="group" aria-label="3D view">
          <button
            type="button"
            className="portal-plan-ctl"
            disabled={!stagePlan}
            onClick={() => viewer?.setView('top')}
          >
            Top
          </button>
          <button
            type="button"
            className="portal-plan-ctl"
            disabled={!stagePlan}
            onClick={() => viewer?.setView('iso')}
          >
            Perspective
          </button>
          <button
            type="button"
            className="portal-plan-ctl is-reset"
            disabled={!stagePlan}
            onClick={() => viewer?.reset()}
          >
            Reset
          </button>
        </div>

        <p className="portal-plan-hint">Drag to orbit · Scroll to zoom</p>
      </div>

      {stagePlan && !outlined && !onBasement && (
        <p className="portal-plan-caption">
          Your residence is on this level; the sheet does not tag its rooms individually.
        </p>
      )}
      <p className="portal-plan-note">
        Furniture shown for scale is illustrative; fixtures follow the as-built plans.
      </p>

      <div className="portal-plan-parking">
        <p className="portal-plan-label">
          <IconCar size={13} />
          Your parking &amp; storage
        </p>
        {parking.status === 'loading' ? (
          <p className="portal-plan-quiet">Reading the basement sheets…</p>
        ) : chips.length === 0 ? (
          <p className="portal-plan-quiet">
            {parking.incomplete
              ? 'The basement sheets could not be read just now.'
              : 'No parking bay is tagged to this residence on the as-built sheets.'}
          </p>
        ) : (
          <ul className="portal-plan-chips">
            {chips.map((chip) => {
              const selected = chip.levelId === level.id;
              return (
                <li key={chip.key}>
                  <button
                    type="button"
                    className={`portal-plan-chip${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => goToLevel(chip.levelId)}
                  >
                    {chip.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="portal-plan-links">
        <Link
          to={`/floor-plans?level=${level.id}&unit=${encodeURIComponent(residence.apartment)}`}
          className="btn btn-outline-gold btn-sm"
        >
          Open full floor plan <IconArrowRight size={13} />
        </Link>
        {unit.floorPlanUrl && (
          <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-plan-doc">
            <IconLayers size={15} />
            Plan document
          </a>
        )}
      </div>
    </section>
  );
}

/* ---------- Page ---------- */

export default function Residence() {
  const [data, setData] = useState<MyResidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [type, setType] = useState<ListingType>('RENT');
  const [furnished, setFurnished] = useState<Furnished | null>(null);

  function load() {
    api
      .get<MyResidence>('/resident/residence')
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        notes: form.get('notes') || undefined,
      });
      (e.target as HTMLFormElement).reset();
      setFurnished(null);
      setJustSubmitted(true);
      load();
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const unit = data?.unit;
  // Matching is pure and cheap; the stage (and its fetches) lives in ResidencePlan.
  const residence = useMemo(() => matchResidence(unit?.block, unit?.number), [unit?.block, unit?.number]);
  const levels = useMemo(() => (residence ? residenceLevels(residence) : []), [residence]);
  const matched = residence !== null;

  return (
    <div className="portal-page">
      <section className="portal-hero" style={{ minHeight: 150 }}>
        <Photo src="/images/shoot/block-a-2.jpg" alt="" sizes="100vw" />
        <div className="portal-hero-scrim" />
        <div className="portal-hero-content">
          <p className="eyebrow" style={{ color: '#e9e1cc' }}>
            <IconHome size={14} />
            Your Home
          </p>
          <h1>
            {unit?.sizeSqm ? `${unit.sizeSqm} m² · Block ${unit.block}` : `Residence ${unit?.number ?? ''}`}
          </h1>
          <p className="portal-hero-sub">Garden View Residency</p>
        </div>
      </section>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-residence-summary">
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconLayers size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">Floor Plan</p>
            <p className="portal-residence-summary-desc">
              {matched
                ? `As-built 3D plan of ${levels.map((l) => l.label).join(' and ')} — view below.`
                : UNMATCHED_COPY}
            </p>
          </div>
        </div>
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconImage size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">Block {unit?.block ?? ''} Photos</p>
            <p className="portal-residence-summary-desc">
              {data && data.blockImages.length > 0
                ? `${data.blockImages.length} photo${data.blockImages.length === 1 ? '' : 's'} available — view below.`
                : `Photos of Block ${unit?.block ?? 'your building'} will appear here once building management uploads them.`}
            </p>
          </div>
        </div>
        <div className="portal-residence-summary-item">
          <span className="portal-residence-summary-icon">
            <IconTag size={18} />
          </span>
          <div>
            <p className="portal-residence-summary-label">List Your Unit</p>
            <p className="portal-residence-summary-desc">
              Thinking of selling or renting out your unit? Send us the details below.
            </p>
          </div>
        </div>
      </div>

      {unit && matched && (
        <>
          <div className="portal-doc-category-head">
            <span className="portal-doc-category-icon">
              <IconLayers size={16} />
            </span>
            <p>My Floor Plan</p>
          </div>
          <ResidencePlan unit={unit} />
        </>
      )}

      {/* An admin-uploaded plan document still shows on its own when the residence is unmatched. */}
      {unit?.floorPlanUrl &&
        !matched &&
        (unit.floorPlanUrl.toLowerCase().endsWith('.pdf') ? (
          <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-floorplan-link">
            <IconLayers size={20} />
            <span>Plan document (PDF)</span>
          </a>
        ) : (
          <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-floorplan-card">
            <img src={unit.floorPlanUrl} alt={`Plan document for Unit ${unit.block}-${unit.number}`} />
          </a>
        ))}

      {data && data.blockImages.length > 0 && (
        <div className="portal-block-gallery">
          {data.blockImages.map((img) => (
            <figure key={img.id}>
              <img src={img.url} alt={img.caption ?? `Block ${img.block}`} />
              {img.caption && <figcaption>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      <div className="portal-doc-category-head">
        <span className="portal-doc-category-icon">
          <IconTag size={16} />
        </span>
        <p>List Your Unit Details</p>
      </div>

      <div className="portal-request-panel">
        <div className="portal-type-toggle">
          <button type="button" className={type === 'SALE' ? 'is-active' : ''} onClick={() => setType('SALE')}>
            <IconTag size={16} /> For Sale
          </button>
          <button type="button" className={type === 'RENT' ? 'is-active' : ''} onClick={() => setType('RENT')}>
            <IconHome size={16} /> For Rent
          </button>
        </div>

        <form className="portal-inline-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="askingPrice">{type === 'SALE' ? 'Asking Price ($)' : 'Monthly Rent ($)'}</label>
              <div className="portal-input-prefixed">
                <span>$</span>
                <input
                  id="askingPrice"
                  name="askingPrice"
                  type="number"
                  min={0}
                  placeholder={type === 'SALE' ? 'Enter asking price' : 'Enter monthly rent'}
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="availableFrom">Available From</label>
              <input id="availableFrom" name="availableFrom" type="date" />
            </div>
          </div>

          {type === 'RENT' && (
            <div className="form-field">
              <label htmlFor="leaseDuration">Lease Duration</label>
              <select id="leaseDuration" name="leaseDuration" defaultValue="">
                <option value="" disabled>
                  Select lease duration
                </option>
                {LEASE_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field">
            <label>Furnished</label>
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
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={3} placeholder="Anything our team should know..." />
          </div>
          {justSubmitted ? (
            <div className="portal-success-chip">
              <IconCheck size={16} /> Request received — we'll follow up soon.
            </div>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Submit Request'}
            </button>
          )}
        </form>
      </div>

      {data && data.listingRequests.length > 0 && (
        <>
          <h2 className="portal-subheading">History</h2>
          <div className="portal-timeline">
            {data.listingRequests.map((r) => (
              <div key={r.id} className={`portal-timeline-item portal-timeline-${r.status.toLowerCase()}`}>
                <span className="portal-timeline-dot" />
                <div className="portal-timeline-card">
                  <div className="portal-timeline-card-head">
                    <strong>
                      {r.type === 'SALE' ? 'For Sale' : 'For Rent'}
                      {r.askingPrice != null && (
                        <span className="portal-request-type"> · ${r.askingPrice.toLocaleString()}</span>
                      )}
                    </strong>
                    <span className={`portal-badge portal-badge-${r.status.toLowerCase()}`}>
                      {LISTING_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  {r.notes && <p>{r.notes}</p>}
                  <span className="portal-timeline-time">
                    Submitted {new Date(r.createdAt).toLocaleDateString()}
                    {r.availableFrom && ` · Available ${new Date(r.availableFrom).toLocaleDateString()}`}
                    {r.leaseDuration && ` · ${r.leaseDuration}`}
                    {r.furnished && ` · ${FURNISHED_OPTIONS.find((f) => f.value === r.furnished)?.label}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
