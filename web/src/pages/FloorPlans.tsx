import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PlanLevel, PlanLevelId } from '../data/floorPlans';
import { PLAN_LEVELS, planIdForFloor, planLevelById } from '../data/floorPlans';
import type { Plan3D } from '../data/floorPlan3d';
import { bayResidenceCode, loadPlan3D, PLANT_ROOM } from '../data/floorPlan3d';
import type { UnitRecord } from '../data/buildingExplorer';
import {
  BLOCK_INFO,
  TOTAL_BLOCKS,
  TOTAL_UNITS,
  UNIT_KIND_LABEL,
  UNITS,
  unitsOnFloor,
} from '../data/buildingExplorer';
import type { FloorPlan3DHandle } from '../components/FloorPlan3D';
import {
  IconArrowRight,
  IconBuilding,
  IconCar,
  IconHome,
  IconLayers,
  IconLeaf,
  IconSun,
  IconWaves,
  IconWrench,
} from '../components/Icons';
import '../styles/plans.css';

// three.js and the model builder only load when a 3D sheet is actually shown.
const FloorPlan3D = lazy(() => import('../components/FloorPlan3D'));

const DEFAULT_LEVEL_ID = 'g';
/** The as-built survey the drawing set records. */
const SURVEY_YEAR = 2010;

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;
const PAN_STEP = 48;

const RESIDENTIAL_LEVELS = PLAN_LEVELS.filter((l) => l.kind === 'residential');
const PARKING_LEVELS = PLAN_LEVELS.filter((l) => l.kind === 'parking');

/** Kind label, plus the floor range for plain duplexes whose label doesn't already carry it. */
function unitSubLabel(unit: UnitRecord): string {
  const label = UNIT_KIND_LABEL[unit.kind];
  if (unit.kind === 'duplex') {
    const lo = Math.min(...unit.floors);
    const hi = Math.max(...unit.floors);
    return `${label} · Floors ${lo}–${hi}`;
  }
  return label;
}

/* ---------- `?unit=` deep links ---------- */

/** Comparison form of a residence code: case- and separator-blind ("3 A1", "3a1", "3-A1"). */
function canonicalCode(code: string): string {
  return code.toUpperCase().replace(/[\s\-_.]+/g, '');
}

/** The registry record a `?unit=` value names, or null for anything the registry doesn't list. */
function unitByCode(code: string | null | undefined): UnitRecord | null {
  if (!code) return null;
  const wanted = canonicalCode(code);
  if (!wanted) return null;
  return UNITS.find((u) => canonicalCode(u.apartment) === wanted) ?? null;
}

/** The plan level a residence's lowest floor is drawn on. */
function lowestLevelOf(unit: UnitRecord): PlanLevel | undefined {
  return planLevelById(planIdForFloor(Math.min(...unit.floors)));
}

/** "Ground", "Level 1" — the level's name as it reads inside a sentence. */
function levelName(level: PlanLevel): string {
  return level.id === 'g' ? 'Ground' : level.label;
}

/* ---------- Selected residence: what the as-built rooms measure to ---------- */

type AptEntry = NonNullable<Plan3D['apartments']>[number];

/** The residence's entry on a sheet, matched like the URL is (case- and separator-blind). */
function aptEntry(plan: Plan3D | null | undefined, code: string): AptEntry | null {
  if (!plan?.apartments) return null;
  const wanted = canonicalCode(code);
  return plan.apartments.find((a) => canonicalCode(a.code) === wanted) ?? null;
}

/** A number is shown only when the sheet closed every room of the residence on that level. */
function measuredNet(entry: AptEntry | null): number | null {
  return entry?.complete === true && typeof entry.areaSqm === 'number' ? entry.areaSqm : null;
}

/** How far a level's outline has come, when it is not yet measurable. */
function pendingText(entry: AptEntry | null): string {
  const rooms = entry?.rooms ?? 0;
  if (rooms > 0) return `${rooms} ${rooms === 1 ? 'room' : 'rooms'} outlined · area being measured`;
  return 'Pinned on this sheet · rooms being outlined';
}

const fmtSqm = (sqm: number) => `≈ ${Math.round(sqm)} m²`;

type ResidenceSummaryProps = {
  unit: UnitRecord;
  level: PlanLevel;
  /** This level's own model (undefined while it loads or when the level has none). */
  levelPlan: Plan3D | undefined;
  /** A duplex's other level; undefined for a simplex. */
  partnerLevel: PlanLevel | undefined;
  /** The partner sheet's model: undefined while loading, null when the level has none. */
  partnerPlan: Plan3D | null | undefined;
};

/**
 * Net internal areas come straight from the level models and only when a level's footprint is
 * complete; a duplex total needs both of its sheets complete. Anything short of that is said as
 * progress on the outline — never a number.
 */
function ResidenceSummary({ unit, level, levelPlan, partnerLevel, partnerPlan }: ResidenceSummaryProps) {
  const code = unit.apartment;
  const here = aptEntry(levelPlan, code);
  const hereNet = measuredNet(here);
  const there = partnerLevel && partnerPlan !== undefined ? aptEntry(partnerPlan, code) : null;
  const thereNet = partnerLevel && partnerPlan !== undefined ? measuredNet(there) : null;

  let scope: string | null = null;
  let value: number | null = null;
  let valueUnit = 'net';
  const lines: string[] = [];
  let pending: string | null = null;
  // outdoorSqm covers terraces, balconies and — for the ground-floor duplexes — private gardens
  const outdoorLabel = unit.kind === 'garden-duplex' ? 'terraces / gardens' : 'terraces / balconies';

  if (levelPlan === undefined) {
    // the sheet is still loading: say nothing about its outline yet
    pending = 'Reading the sheet…';
  } else if (partnerLevel && hereNet !== null && thereNet !== null) {
    const [lo, hi] = [level, partnerLevel].sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0));
    scope = `${levelName(lo)} + ${levelName(hi)}`;
    value = hereNet + thereNet;
    lines.push(`${fmtSqm(hereNet)} net on this level`);
    const outdoor = (here?.outdoorSqm ?? 0) + (there?.outdoorSqm ?? 0);
    if (outdoor > 0) lines.push(`${fmtSqm(outdoor)} ${outdoorLabel}`);
  } else if (hereNet !== null) {
    value = hereNet;
    valueUnit = partnerLevel ? 'net on this level' : 'net';
    const outdoor = here?.outdoorSqm ?? 0;
    if (outdoor > 0) lines.push(`${fmtSqm(outdoor)} ${outdoorLabel}${partnerLevel ? ' on this level' : ''}`);
    if (partnerLevel && partnerPlan !== undefined) {
      lines.push(`${levelName(partnerLevel)} · ${pendingText(there)}`);
    }
  } else {
    // this level is not measurable: progress on its outline, and no partial number at all
    pending = pendingText(here);
  }

  return (
    <aside className="plans-selected" aria-live="polite">
      <div className="plans-selected-head">
        <span className="plans-selected-kicker">Selected residence</span>
        <span className="plans-selected-code">{code}</span>
      </div>
      {scope ? <p className="plans-selected-scope">{scope}</p> : null}
      {value !== null ? (
        <p className="plans-selected-value">
          {fmtSqm(value)} <small>{valueUnit}</small>
        </p>
      ) : (
        <p className="plans-selected-pending">{pending}</p>
      )}
      {lines.map((line) => (
        <p key={line} className="plans-selected-line">
          {line}
        </p>
      ))}
      {value !== null ? (
        <p className="plans-selected-caption">Areas are net internal, measured from the as-built plans.</p>
      ) : null}
    </aside>
  );
}

/* ---------- 2D / 3D view mode ---------- */

type ViewMode = '2d' | '3d';
const VIEW_MODE_KEY = 'gv.plans.viewMode';

function readStoredViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return v === '2d' || v === '3d' ? v : '3d';
  } catch {
    return '3d';
  }
}

function storeViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // private mode / quota — the choice simply doesn't persist
  }
}

type ViewModeToggleProps = {
  mode: ViewMode;
  available3d: boolean;
  onChange: (mode: ViewMode) => void;
};

function ViewModeToggle({ mode, available3d, onChange }: ViewModeToggleProps) {
  return (
    <div className="plans-mode" role="group" aria-label="Plan view">
      <button
        type="button"
        className={`plans-mode-btn${mode === '2d' ? ' is-selected' : ''}`}
        aria-pressed={mode === '2d'}
        onClick={() => onChange('2d')}
      >
        2D
      </button>
      <button
        type="button"
        className={`plans-mode-btn${mode === '3d' ? ' is-selected' : ''}`}
        aria-pressed={mode === '3d'}
        disabled={!available3d}
        title={available3d ? undefined : '3D not available for this level'}
        onClick={() => onChange('3d')}
      >
        3D
      </button>
    </div>
  );
}

/* ---------- Illustrative furniture switch (3D only) ---------- */

const FURNITURE_KEY = 'gv.plans.furniture';

function readStoredFurniture(): boolean {
  try {
    return localStorage.getItem(FURNITURE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storeFurniture(on: boolean): void {
  try {
    localStorage.setItem(FURNITURE_KEY, on ? 'on' : 'off');
  } catch {
    // private mode / quota — the choice simply doesn't persist
  }
}

function FurnitureToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className={`plans-switch${on ? ' is-on' : ''}`}
      aria-pressed={on}
      title={on ? 'Hide illustrative furniture' : 'Show illustrative furniture'}
      onClick={() => onChange(!on)}
    >
      <span className="plans-switch-track" aria-hidden="true" />
      Furniture
    </button>
  );
}

function SheetChip({ level }: { level: PlanLevel }) {
  return (
    <div className="plans-sheet-chip">
      Sheet {level.sheet} · as-built {SURVEY_YEAR}
    </div>
  );
}

/* ---------- Pan / zoom viewer ---------- */

type ViewState = { x: number; y: number; scale: number };
const HOME_VIEW: ViewState = { x: 0, y: 0, scale: 1 };

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PlanViewerProps = {
  level: PlanLevel;
  src: string;
  onLoadError: () => void;
  /** Stage-header controls rendered beside the sheet chip. */
  toolbar?: ReactNode;
};

/** Mounted with key={level.id} so the view resets whenever the sheet changes. */
function PlanViewer({ level, src, onLoadError, toolbar }: PlanViewerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [view, setView] = useState<ViewState>(HOME_VIEW);
  const [dragging, setDragging] = useState(false);

  /**
   * Zoom by a factor, keeping the point (px, py) — measured from the stage centre,
   * which is also the sheet's transform origin — fixed under the cursor.
   */
  const zoomBy = useCallback((factor: number, px?: number, py?: number) => {
    setView((prev) => {
      const scale = clampScale(prev.scale * factor);
      if (scale === prev.scale) return prev;
      if (px === undefined || py === undefined) return { ...prev, scale };
      const ratio = scale / prev.scale;
      return { scale, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
    });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const reset = useCallback(() => setView(HOME_VIEW), []);

  // React registers wheel listeners as passive, so the page would scroll while zooming;
  // attach a native non-passive listener instead.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      // normalise line/page delta modes to pixels, then soften large notches
      const raw = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      const delta = Math.max(-250, Math.min(250, raw));
      zoomBy(Math.exp(-delta * 0.0015), px, py);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: view.x,
      originY: view.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setView((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // only when the stage itself is focused — leave the control buttons to their own keys
    if (e.target !== e.currentTarget) return;
    let handled = true;
    switch (e.key) {
      case '+':
      case '=':
        zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
        zoomBy(1 / ZOOM_STEP);
        break;
      case '0':
        reset();
        break;
      case 'ArrowLeft':
        panBy(PAN_STEP, 0);
        break;
      case 'ArrowRight':
        panBy(-PAN_STEP, 0);
        break;
      case 'ArrowUp':
        panBy(0, PAN_STEP);
        break;
      case 'ArrowDown':
        panBy(0, -PAN_STEP);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const isHome = view.x === 0 && view.y === 0 && view.scale === 1;
  const atMin = view.scale <= MIN_SCALE + 1e-6;
  const atMax = view.scale >= MAX_SCALE - 1e-6;

  return (
    <div
      ref={stageRef}
      className={`plans-stage has-plan${dragging ? ' is-dragging' : ''}`}
      tabIndex={0}
      aria-label={`${level.label} plan viewer. Use plus and minus to zoom, arrow keys to pan, 0 to reset.`}
      onKeyDown={onKeyDown}
    >
      <div
        className="plans-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
      >
        <img
          className="plans-sheet"
          src={src}
          alt={`${level.label} plan`}
          draggable={false}
          onError={onLoadError}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>

      <div className="plans-stage-head">
        <SheetChip level={level} />
        {toolbar}
      </div>

      <div className="plans-controls" role="group" aria-label="Plan zoom">
        <button
          type="button"
          className="plans-ctl"
          aria-label="Zoom out"
          disabled={atMin}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          &minus;
        </button>
        <span className="plans-zoom-readout" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          className="plans-ctl"
          aria-label="Zoom in"
          disabled={atMax}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="plans-ctl plans-ctl-reset"
          disabled={isHome}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <p className="plans-hint">Drag to pan · Scroll to zoom</p>
    </div>
  );
}

/* ---------- 3D dollhouse stage ---------- */

type Plan3DStageProps = {
  level: PlanLevel;
  /** The model to show; undefined while the first model for this session is still loading. */
  plan: Plan3D | undefined;
  toolbar: ReactNode;
  /** Owned by the page (as state, so a deep link can wait for the lazy viewer to mount) so the
   *  level card's residence rows can drive the model. */
  viewer: FloorPlan3DHandle | null;
  onViewer: (handle: FloorPlan3DHandle | null) => void;
  onApartmentSelect: (code: string) => void;
  showFurniture: boolean;
};

/** Not keyed by level: the viewer keeps its renderer alive and rebuilds the model in place. */
function Plan3DStage({ level, plan, toolbar, viewer, onViewer, onApartmentSelect, showFurniture }: Plan3DStageProps) {
  return (
    <div className={`plans-stage is-3d${showFurniture ? ' has-note' : ''}`} aria-busy={!plan}>
      {plan ? (
        <Suspense fallback={<div className="plans-3d-fallback" />}>
          <FloorPlan3D
            ref={onViewer}
            plan={plan}
            levelLabel={level.label}
            levelKind={level.kind}
            onApartmentSelect={onApartmentSelect}
            showFurniture={showFurniture}
          />
        </Suspense>
      ) : (
        <div className="plans-3d-fallback" />
      )}

      <div className="plans-stage-head">
        <SheetChip level={level} />
        {toolbar}
      </div>

      <div className="plans-controls" role="group" aria-label="3D view">
        <button
          type="button"
          className="plans-ctl plans-ctl-text"
          disabled={!plan}
          onClick={() => viewer?.setView('top')}
        >
          Top
        </button>
        <button
          type="button"
          className="plans-ctl plans-ctl-text"
          disabled={!plan}
          onClick={() => viewer?.setView('iso')}
        >
          Perspective
        </button>
        <button
          type="button"
          className="plans-ctl plans-ctl-reset"
          disabled={!plan}
          onClick={() => viewer?.reset()}
        >
          Reset
        </button>
      </div>

      <p className="plans-hint">Drag to orbit · Scroll to zoom</p>
      {showFurniture ? (
        <p className="plans-note">Furniture shown for scale is illustrative; fixtures follow the as-built plans.</p>
      ) : null}
    </div>
  );
}

/* ---------- Residence rows ---------- */

type UnitRowProps = {
  unit: UnitRecord;
  /** static: the plain 2D-mode row; tagged/untagged: 3D mode, by whether the sheet carries this code. */
  mode: 'static' | 'tagged' | 'untagged';
  selected: boolean;
  /** The row a `?unit=` link asked for that the sheet cannot light: its note stays open. */
  noted?: boolean;
  onHover: (code: string | null) => void;
  onToggle: (code: string) => void;
};

function UnitRow({ unit, mode, selected, noted = false, onHover, onToggle }: UnitRowProps) {
  const body = (
    <>
      <div>
        <p className="plans-unit-number">{unit.apartment}</p>
        <p className="plans-unit-kind">{unitSubLabel(unit)}</p>
        {mode === 'untagged' ? <p className="plans-unit-note">Not tagged on sheet</p> : null}
      </div>
      <span className="plans-unit-stack">{unit.stack}</span>
    </>
  );
  if (mode === 'static') return <li className="plans-unit-row">{body}</li>;
  const tagged = mode === 'tagged';
  return (
    <li className="plans-unit-item">
      <button
        type="button"
        className={`plans-unit-row is-interactive${tagged ? '' : ' is-untagged'}${selected ? ' is-selected' : ''}${noted && !tagged ? ' is-noted' : ''}`}
        aria-pressed={tagged ? selected : undefined}
        aria-disabled={tagged ? undefined : true}
        onPointerEnter={tagged ? () => onHover(unit.apartment) : undefined}
        onPointerLeave={tagged ? () => onHover(null) : undefined}
        onClick={tagged ? () => onToggle(unit.apartment) : undefined}
      >
        {body}
      </button>
    </li>
  );
}

/* ---------- "On this level" — amenities read off the sheet's model ---------- */

type Amenity = { key: string; label: string; icon: ReactNode };
type ZoneKind = NonNullable<Plan3D['zones']>[number]['kind'];

/** Built only from what the level's model carries; nothing is assumed about a sheet. */
function levelAmenities(plan: Plan3D | undefined, kind: PlanLevel['kind']): Amenity[] {
  if (!plan) return [];
  const zones = plan.zones ?? [];
  const has = (z: ZoneKind) => zones.some((zone) => zone.kind === z);
  const out: Amenity[] = [];
  if (kind === 'parking') {
    const cap = plan.parkingCapacity;
    out.push({
      key: 'car-park',
      label: typeof cap === 'number' && cap > 0 ? `Car park · ${cap} bays` : 'Car park',
      icon: <IconCar size={13} />,
    });
    if (has('water')) out.push({ key: 'pool', label: 'Swimming pool', icon: <IconWaves size={13} /> });
    if (plan.rooms.some((r) => PLANT_ROOM.test(r.name))) {
      out.push({ key: 'plant', label: 'Generator / plant rooms', icon: <IconWrench size={13} /> });
    }
  } else {
    if (has('terrace')) out.push({ key: 'terraces', label: 'Terraces', icon: <IconSun size={13} /> });
    if (has('water')) out.push({ key: 'water', label: 'Water feature', icon: <IconWaves size={13} /> });
    if (has('garden')) out.push({ key: 'garden', label: 'Private garden', icon: <IconLeaf size={13} /> });
  }
  return out;
}

/** Residence codes the level's bays are tagged to, in registry order of appearance. */
function residenceBays(plan: Plan3D | undefined): string[] {
  const codes = new Set<string>();
  for (const bay of plan?.bays ?? []) {
    const code = bayResidenceCode(bay.label);
    if (code) codes.add(code);
  }
  return [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

type LevelAmenitiesProps = {
  amenities: Amenity[];
  bays: string[];
  /** Bay chips drive the model only while it is on screen. */
  interactive: boolean;
  selected: string | null;
  onHover: (code: string | null) => void;
  onToggle: (code: string) => void;
};

function LevelAmenities({ amenities, bays, interactive, selected, onHover, onToggle }: LevelAmenitiesProps) {
  if (amenities.length === 0 && bays.length === 0) return null;
  return (
    <div className="plans-amenities">
      {amenities.length > 0 ? (
        <>
          <p className="plans-amenities-label">On this level</p>
          <ul className="plans-amenity-list">
            {amenities.map((a) => (
              <li key={a.key} className="plans-amenity">
                {a.icon}
                <span>{a.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {bays.length > 0 ? (
        <>
          <p className="plans-amenities-label">Bays for residences</p>
          <ul className="plans-bay-list">
            {bays.map((code) =>
              interactive ? (
                <li key={code}>
                  <button
                    type="button"
                    className={`plans-bay-chip${selected === code ? ' is-selected' : ''}`}
                    aria-pressed={selected === code}
                    onPointerEnter={() => onHover(code)}
                    onPointerLeave={() => onHover(null)}
                    onClick={() => onToggle(code)}
                  >
                    {code}
                  </button>
                </li>
              ) : (
                <li key={code} className="plans-bay-chip is-static">
                  {code}
                </li>
              ),
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/* ---------- Empty stage ---------- */

function PlanPending({ level, toolbar }: { level: PlanLevel; toolbar?: ReactNode }) {
  return (
    <div className="plans-stage is-empty">
      {toolbar ? <div className="plans-stage-head">{toolbar}</div> : null}
      <div className="plans-empty">
        <span className="plans-empty-icon">
          <IconLayers size={22} />
        </span>
        <p className="plans-empty-title">{level.label} plan</p>
        <p className="plans-empty-line">
          This sheet is being prepared for the web from the as-built drawing set.
        </p>
        <p className="plans-empty-sheet">Sheet {level.sheet}</p>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

/** The level's 3D model, tagged with the key it was fetched for so a stale result is never shown. */
type Plan3DLoad = { key: string; status: 'ready'; plan: Plan3D } | { key: string; status: 'none' };

export default function FloorPlans() {
  const [searchParams, setSearchParams] = useSearchParams();

  // `?unit=` names a residence to land on; it is matched to the registry, and only ever written
  // back in the registry's own form.
  const unitParam = searchParams.get('unit');
  const linkedUnit = useMemo(() => unitByCode(unitParam), [unitParam]);

  // The URL is the source of truth so a picked level is always shareable. Without an explicit
  // level, a linked residence opens on its lowest floor.
  const level = useMemo(() => {
    return (
      planLevelById(searchParams.get('level')) ??
      (linkedUnit ? lowestLevelOf(linkedUnit) : undefined) ??
      planLevelById(DEFAULT_LEVEL_ID) ??
      PLAN_LEVELS[0]
    );
  }, [searchParams, linkedUnit]);

  // Moving level keeps the linked residence only where it spans the target (a duplex's partner sheet).
  const selectLevel = (id: PlanLevelId) => {
    const target = planLevelById(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('level', id);
        const unit = unitByCode(next.get('unit'));
        const spans = unit !== null && typeof target?.floor === 'number' && unit.floors.includes(target.floor);
        if (!spans) next.delete('unit');
        return next;
      },
      { replace: true },
    );
  };

  // A sheet that fails to load falls back to the pending state rather than a broken image.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const planSrc = level.src && level.src !== brokenSrc ? level.src : null;

  /* ---- 3D model loading ---- */
  const plan3dKey = level.id;
  const [plan3dLoad, setPlan3dLoad] = useState<Plan3DLoad | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    loadPlan3D(level.id, ac.signal)
      .then((plan) => {
        if (ac.signal.aborted) return;
        setPlan3dLoad(plan ? { key: plan3dKey, status: 'ready', plan } : { key: plan3dKey, status: 'none' });
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setPlan3dLoad({ key: plan3dKey, status: 'none' });
      });
    return () => ac.abort();
  }, [plan3dKey, level.id]);

  const loading3d = plan3dLoad === null || plan3dLoad.key !== plan3dKey;
  const has3d = !loading3d && plan3dLoad.status === 'ready';
  // While the next level's model loads, keep showing the previous one so the renderer never flashes.
  const shownPlan = plan3dLoad?.status === 'ready' ? plan3dLoad.plan : undefined;
  /** This level's own model — never the previous level's while loading — for the card's facts. */
  const levelPlan = has3d ? plan3dLoad.plan : undefined;

  // A link to a residence is a request to see it lit, which only the 3D view can do — open in 3D
  // for that visit without overriding the visitor's stored preference.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (unitParam ? '3d' : readStoredViewMode()));
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  };

  const show3d = viewMode === '3d' && (has3d || loading3d);

  const [showFurniture, setShowFurniture] = useState<boolean>(readStoredFurniture);
  const changeFurniture = (on: boolean) => {
    setShowFurniture(on);
    storeFurniture(on);
  };

  /* ---- apartment selection (3D mode) ---- */
  // The handle is state, not a ref: the viewer chunk mounts lazily, often after the level's model
  // has resolved, and a deep-linked residence must be focused once it is actually there.
  const [viewer, setViewer] = useState<FloorPlan3DHandle | null>(null);
  const [selectedApt, setSelectedApt] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const setSelection = useCallback(
    (next: string | null) => {
      selectedRef.current = next;
      setSelectedApt(next);
      viewer?.focusApartment(next);
    },
    [viewer],
  );
  // A chip or pin click owns the URL's `unit` too, so the selection is shareable.
  const toggleApartment = useCallback(
    (code: string) => {
      const next = selectedRef.current === code ? null : code;
      setSelection(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set('unit', next);
          else params.delete('unit');
          return params;
        },
        { replace: true },
      );
    },
    [setSelection, setSearchParams],
  );
  const hoverApartment = useCallback(
    (code: string | null) => {
      viewer?.highlightApartment(code);
    },
    [viewer],
  );

  /** Codes the sheet actually tags; null when this model predates apartment tagging. */
  const taggedCodes = useMemo(
    () => (levelPlan?.apartments ? new Set(levelPlan.apartments.map((a) => a.code.trim())) : null),
    [levelPlan],
  );
  const rowsInteractive = show3d && has3d && taggedCodes !== null;

  const amenities = useMemo(() => levelAmenities(levelPlan, level.kind), [levelPlan, level.kind]);
  const bayCodes = useMemo(() => residenceBays(levelPlan), [levelPlan]);

  /** Everything the viewer can frame on this sheet: tagged residences and the residences' bays. */
  const selectableCodes = useMemo(() => {
    const codes = new Set(taggedCodes ?? []);
    for (const code of bayCodes) codes.add(code);
    return codes;
  }, [taggedCodes, bayCodes]);

  // One reconciliation for the selection: it belongs to a sheet, so a level or mode change clears
  // it (model included), and a `?unit=` link applies once this level's model and the viewer are
  // both there.
  useEffect(() => {
    const code =
      show3d && has3d && linkedUnit && selectableCodes.has(linkedUnit.apartment) ? linkedUnit.apartment : null;
    setSelection(code);
  }, [viewer, plan3dKey, level.id, show3d, has3d, linkedUnit, selectableCodes, setSelection]);

  const toolbar = (
    <>
      <ViewModeToggle
        mode={show3d ? '3d' : '2d'}
        available3d={has3d || loading3d}
        onChange={changeViewMode}
      />
      {show3d ? <FurnitureToggle on={showFurniture} onChange={changeFurniture} /> : null}
    </>
  );

  const isResidential = level.kind === 'residential' && typeof level.floor === 'number';

  const blockGroups = useMemo(() => {
    if (typeof level.floor !== 'number') return [];
    const floor = level.floor;
    return BLOCK_INFO.map((block) => ({ block, units: unitsOnFloor(block.id, floor) })).filter(
      (g) => g.units.length > 0,
    );
  }, [level]);

  const residenceCount = blockGroups.reduce((sum, g) => sum + g.units.length, 0);

  /* ---- the residence the card speaks for: the lit one, else the linked one on this floor ---- */
  const onThisFloor = (unit: UnitRecord) =>
    typeof level.floor === 'number' && unit.floors.includes(level.floor);
  const panelUnit: UnitRecord | null = !isResidential
    ? null
    : selectedApt
      ? unitByCode(selectedApt)
      : linkedUnit && onThisFloor(linkedUnit)
        ? linkedUnit
        : null;

  // A duplex's other sheet, fetched once so both levels can be read together. (PLAN_LEVELS entries
  // are stable objects, so this is a safe effect dependency.)
  const partnerFloor =
    panelUnit && typeof level.floor === 'number'
      ? panelUnit.floors.find((f) => f !== level.floor)
      : undefined;
  const partnerLevel = partnerFloor === undefined ? undefined : planLevelById(planIdForFloor(partnerFloor));
  const partnerCache = useRef(new Map<PlanLevelId, Plan3D | null>());
  const [partnerLoad, setPartnerLoad] = useState<{ id: PlanLevelId; plan: Plan3D | null } | null>(null);
  useEffect(() => {
    if (!partnerLevel) return;
    const id = partnerLevel.id;
    const cached = partnerCache.current.get(id);
    if (cached !== undefined) {
      setPartnerLoad({ id, plan: cached });
      return;
    }
    const ac = new AbortController();
    loadPlan3D(id, ac.signal)
      .then((plan) => {
        if (ac.signal.aborted) return;
        partnerCache.current.set(id, plan);
        setPartnerLoad({ id, plan });
      })
      .catch(() => {
        if (!ac.signal.aborted) setPartnerLoad({ id, plan: null });
      });
    return () => ac.abort();
  }, [partnerLevel]);
  const partnerPlan = partnerLevel && partnerLoad?.id === partnerLevel.id ? partnerLoad.plan : undefined;

  /* ---- a `?unit=` link the sheet cannot answer: one quiet line, never a banner ---- */
  let linkNote: ReactNode = null;
  if (unitParam && !linkedUnit) {
    linkNote = <>No registered residence matches “{unitParam.trim()}”.</>;
  } else if (linkedUnit && !loading3d && !selectableCodes.has(linkedUnit.apartment)) {
    const home = lowestLevelOf(linkedUnit);
    if (isResidential && !onThisFloor(linkedUnit) && home) {
      linkNote = (
        <>
          {linkedUnit.apartment} is on {levelName(home)}.{' '}
          <Link to={`/floor-plans?level=${home.id}&unit=${encodeURIComponent(linkedUnit.apartment)}`}>
            View it there
          </Link>
        </>
      );
    } else if (isResidential) {
      linkNote = <>{linkedUnit.apartment} isn’t outlined on this sheet yet.</>;
    } else if (has3d) {
      linkNote = <>No bays are tagged to {linkedUnit.apartment} on this sheet.</>;
    }
  }

  return (
    <div className="plans-page">
      <div className="container">
        <nav className="plans-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <Link to="/explorer">Explorer</Link>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <span className="current">Floor Plans</span>
        </nav>

        <div className="plans-head">
          <div>
            <h1>Floor Plans</h1>
            <p className="plans-sub">As-built architectural plans for every level of Garden View.</p>
          </div>
          <div className="plans-stats">
            <div className="plans-stat">
              <IconLayers size={20} />
              <div>
                <strong>{PLAN_LEVELS.length}</strong>
                <span>Levels</span>
              </div>
            </div>
            <div className="plans-stat">
              <IconHome size={20} />
              <div>
                <strong>{TOTAL_UNITS}</strong>
                <span>Residences</span>
              </div>
            </div>
            <div className="plans-stat">
              <IconBuilding size={20} />
              <div>
                <strong>{TOTAL_BLOCKS}</strong>
                <span>Blocks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="plans-grid">
          {/* Level rail */}
          <div className="plans-col plans-col-rail">
            <p className="plans-step-label">Select Level</p>
            <div className="plans-rail">
              {RESIDENTIAL_LEVELS.map((l) => {
                const isSelected = l.id === level.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`plans-pill${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={l.label}
                    onClick={() => selectLevel(l.id)}
                  >
                    {l.short}
                  </button>
                );
              })}
              <div className="plans-rail-divider" aria-hidden="true" />
              {PARKING_LEVELS.map((l) => {
                const isSelected = l.id === level.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`plans-pill is-basement${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={l.label}
                    onClick={() => selectLevel(l.id)}
                  >
                    {l.short}
                  </button>
                );
              })}

              {/* the bracket itself spans the levels, so the short labels stay within it */}
              <div className="plans-range plans-range-penthouse" aria-hidden="true">
                <span>Penthouse</span>
              </div>
              <div className="plans-range plans-range-residences" aria-hidden="true">
                <span>Residences 2–8</span>
              </div>
              <div className="plans-range plans-range-garden" aria-hidden="true">
                <span>Duplex G–1</span>
              </div>
              <div className="plans-range plans-range-parking" aria-hidden="true">
                <span>Parking</span>
              </div>
            </div>
          </div>

          {/* Plan stage */}
          <div className="plans-col plans-col-stage">
            {show3d ? (
              <Plan3DStage
                level={level}
                plan={shownPlan}
                toolbar={toolbar}
                viewer={viewer}
                onViewer={setViewer}
                onApartmentSelect={toggleApartment}
                showFurniture={showFurniture}
              />
            ) : planSrc ? (
              <PlanViewer
                key={level.id}
                level={level}
                src={planSrc}
                onLoadError={() => setBrokenSrc(planSrc)}
                toolbar={toolbar}
              />
            ) : (
              <PlanPending level={level} toolbar={has3d ? toolbar : undefined} />
            )}
          </div>

          {/* Level card */}
          <div className="plans-col plans-col-level">
            <p className="plans-step-label">Level Details</p>
            <div className="plans-level">
              {/* keyed so switching level re-runs the fade-up on the swapping region */}
              <div key={level.id} className="plans-level-content">
                <p className="plans-level-kicker">
                  {level.kind === 'parking' ? 'Parking level' : 'Residential level'}
                </p>
                <h2 className="plans-level-title">{level.label}</h2>
                <div className="plans-level-chips">
                  <span className="plans-tag">Sheet {level.sheet}</span>
                  <span className="plans-tag is-muted">As-built {SURVEY_YEAR}</span>
                </div>

                <LevelAmenities
                  amenities={amenities}
                  bays={bayCodes}
                  interactive={show3d && has3d}
                  selected={selectedApt}
                  onHover={hoverApartment}
                  onToggle={toggleApartment}
                />

                {!isResidential && linkNote ? <p className="plans-level-note">{linkNote}</p> : null}

                {isResidential ? (
                  <>
                    <p className="plans-level-count">
                      {residenceCount} {residenceCount === 1 ? 'residence' : 'residences'} on this
                      level
                    </p>
                    {linkNote ? <p className="plans-level-note">{linkNote}</p> : null}
                    {panelUnit ? (
                      <ResidenceSummary
                        key={panelUnit.apartment}
                        unit={panelUnit}
                        level={level}
                        levelPlan={levelPlan}
                        partnerLevel={partnerLevel}
                        partnerPlan={partnerPlan}
                      />
                    ) : null}
                    {blockGroups.map(({ block, units }) => (
                      <section key={block.id} className="plans-block-group">
                        <header className="plans-block-head">
                          <span className="plans-block-badge" aria-hidden="true">
                            {block.id}
                          </span>
                          <span className="plans-block-name">{block.name}</span>
                          <span className="plans-block-count">
                            {units.length} {units.length === 1 ? 'residence' : 'residences'}
                          </span>
                        </header>
                        <ul className="plans-unit-list">
                          {units.map((unit) => (
                            <UnitRow
                              key={unit.apartment}
                              unit={unit}
                              mode={
                                !rowsInteractive
                                  ? 'static'
                                  : taggedCodes?.has(unit.apartment)
                                    ? 'tagged'
                                    : 'untagged'
                              }
                              selected={selectedApt === unit.apartment}
                              noted={linkedUnit?.apartment === unit.apartment}
                              onHover={hoverApartment}
                              onToggle={toggleApartment}
                            />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </>
                ) : (
                  <div className="plans-facts">
                    <div className="plans-fact">
                      <IconCar size={14} />
                      <span>Resident parking and building services — levels B1–B3.</span>
                    </div>
                    <div className="plans-fact">
                      <IconLayers size={14} />
                      <span>
                        Sheet {level.sheet} of the as-built drawing set ({SURVEY_YEAR}).
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="plans-level-footer">
                <Link to="/explorer" className="btn btn-outline-gold btn-block">
                  Open 3D Explorer
                </Link>
                <Link to="/location" className="btn btn-gold btn-block">
                  Ask About A Residence <IconArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
