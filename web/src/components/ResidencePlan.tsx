import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FloorPlan3DHandle } from './FloorPlan3D';
import type { PlanLevelId } from '../data/floorPlans';
import { floorLabel, UNIT_KIND_LABEL } from '../data/buildingExplorer';
import { planOutlinesResidence, planTagsResidence, useUnitPlan, type ParkingTag } from '../data/useUnitPlan';
import { AREA_SOURCE_NOTE, formatSqm, useUnitArea } from '../data/planAreas';
import { IconArrowRight, IconCar, IconLayers } from './Icons';

// A residence's interactive 3D plan: its level(s) from the as-built model with the residence lit,
// its measured area, and the parking bays and storage the basement sheets tag to it. Used by the
// resident portal (My Residence) and by public listings. three.js loads only when it is shown.
const FloorPlan3D = lazy(() => import('./FloorPlan3D'));

/** The as-built survey the drawing set records. */
const SURVEY_YEAR = 2010;

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
  /** The unit as the portal stores it: block letter + registered number ("3 A1"). */
  unit: { block: string; number: string; floorPlanUrl?: string | null };
  /** 'owner' in the resident portal ("Your parking"); 'public' on a listing. */
  audience?: 'owner' | 'public';
};

export default function ResidencePlan({ unit, audience = 'owner' }: ResidencePlanProps) {
  const own = audience === 'owner';
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
          {own ? 'Your residence' : 'This residence'} is on this level; the sheet does not tag its rooms individually.
        </p>
      )}
      <p className="portal-plan-note">
        Furniture shown for scale is illustrative; fixtures follow the as-built plans.
      </p>

      <div className="portal-plan-parking">
        <p className="portal-plan-label">
          <IconCar size={13} />
          {own ? 'Your parking & storage' : 'Parking & storage'}
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
