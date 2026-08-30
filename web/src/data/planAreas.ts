// Measured areas of a residence, read from the as-built plan models (/plans/level-<id>.3d.json).
//
// A residence's footprint lives on one sheet (a simplex) or two (a duplex). Each sheet's
// `apartments[]` entry carries the net internal and outdoor area measured on THAT level, and a
// `complete` flag that is true only when every room of the residence on the level is enclosed and
// assigned. A number is only ever surfaced when every level the registry says the residence spans
// is complete — partial sums are never a residence's area.
//
// Plan models are fetched once per level for the whole session and shared by every consumer
// (explorer rows, the portal card, the floor-plans page), so forty rows cost one request per sheet.

import { useEffect, useMemo, useState } from 'react';
import type { UnitRecord } from './buildingExplorer';
import type { PlanLevel, PlanLevelId } from './floorPlans';
import type { Plan3D } from './floorPlan3d';
import { loadPlan3D } from './floorPlan3d';
import { canonicalCode, matchResidence, residenceLevels } from './useUnitPlan';

/* ---------- shared plan cache ---------- */

const planCache = new Map<PlanLevelId, Promise<Plan3D | null>>();
/** Models that have arrived (null = the level has no 3D data), readable synchronously. */
const settled = new Map<PlanLevelId, Plan3D | null>();

/**
 * A level's 3D model, fetched at most once per session. Resolves null when the level has no 3D
 * data (404). A failed fetch (network, or a sheet being rewritten under us) is not cached, so the
 * next mount retries it.
 */
export function getPlan3D(id: PlanLevelId): Promise<Plan3D | null> {
  const cached = planCache.get(id);
  if (cached) return cached;
  const request = loadPlan3D(id)
    .then((plan) => {
      settled.set(id, plan);
      return plan;
    })
    .catch((err: unknown) => {
      planCache.delete(id);
      throw err;
    });
  planCache.set(id, request);
  return request;
}

/** The model for a level if it has already arrived this session; undefined while unknown. */
export function settledPlan3D(id: PlanLevelId): Plan3D | null | undefined {
  return settled.get(id);
}

/* ---------- pure measurement ---------- */

export type LevelArea = {
  levelId: PlanLevelId;
  /** "Level 3", "Ground Floor". */
  label: string;
  level: PlanLevel;
  /** Net internal area on this level, m² (only when the sheet gives one). */
  areaSqm?: number;
  /** Terraces, balconies and gardens on this level, m². */
  outdoorSqm?: number;
  /** Rooms the sheet assigns to the residence on this level. */
  rooms?: number;
  /** Every room of the residence on this level is enclosed and assigned. */
  complete: boolean;
  source?: 'tag' | 'inferred';
};

export type UnitArea = {
  code: string;
  /** One entry per residential level the residence spans, lowest first. */
  levels: LevelArea[];
  /** Net internal total across all spanned levels — present only when `complete`. */
  netSqm?: number;
  /** Outdoor total across all spanned levels — present only when `complete`. */
  outdoorSqm?: number;
  /** Every spanned level is complete, so the totals are reliable. */
  complete: boolean;
};

function apartmentEntry(plan: Plan3D | null | undefined, code: string) {
  if (!plan?.apartments) return null;
  const wanted = canonicalCode(code);
  return plan.apartments.find((a) => canonicalCode(a.code) === wanted) ?? null;
}

/**
 * Measure a residence from the plan models at hand. A level missing from `plans` (not fetched,
 * or no 3D data) simply counts as incomplete.
 */
export function residenceArea(unit: UnitRecord, plans: ReadonlyMap<PlanLevelId, Plan3D | null | undefined>): UnitArea {
  const levels: LevelArea[] = residenceLevels(unit).map((level) => {
    const entry = apartmentEntry(plans.get(level.id), unit.apartment);
    const complete = entry?.complete === true && typeof entry.areaSqm === 'number';
    return {
      levelId: level.id,
      label: level.label,
      level,
      areaSqm: typeof entry?.areaSqm === 'number' ? entry.areaSqm : undefined,
      outdoorSqm: typeof entry?.outdoorSqm === 'number' ? entry.outdoorSqm : undefined,
      rooms: entry?.rooms,
      complete,
      source: entry?.source,
    };
  });
  const complete = levels.length > 0 && levels.every((l) => l.complete);
  if (!complete) return { code: unit.apartment, levels, complete: false };
  const netSqm = levels.reduce((sum, l) => sum + (l.areaSqm ?? 0), 0);
  const outdoorSqm = levels.reduce((sum, l) => sum + (l.outdoorSqm ?? 0), 0);
  return { code: unit.apartment, levels, netSqm, outdoorSqm, complete: true };
}

/* ---------- formatting ---------- */

/** Provenance line for every measured figure. Never "gross", never "sellable". */
export const AREA_SOURCE_NOTE = 'measured from the as-built plans';

/** "≈ 226 m²" — whole square metres. */
export function formatSqm(n: number): string {
  return `≈ ${Math.round(n)} m²`;
}

/** "≈ 226 m² net" (+ " · ≈ 36 m² outdoor" when there is any), or null when the residence is not fully measured. */
export function areaCaption(area: UnitArea | null | undefined): string | null {
  if (!area?.complete || area.netSqm === undefined) return null;
  let text = `${formatSqm(area.netSqm)} net`;
  if (area.outdoorSqm !== undefined && area.outdoorSqm > 0) text += ` · ${formatSqm(area.outdoorSqm)} outdoor`;
  return text;
}

/** Rail-style span of the levels a residence occupies: "G–1", "9–10"; a single level gives "3". */
export function levelSpanShort(levels: readonly LevelArea[]): string {
  if (levels.length === 0) return '';
  if (levels.length === 1) return levels[0].level.short;
  return `${levels[0].level.short}–${levels[levels.length - 1].level.short}`;
}

/* ---------- hooks ---------- */

function levelKey(ids: readonly PlanLevelId[]): string {
  return ids.join(',');
}

/**
 * The models for a set of levels, from the shared cache. `status` is "ready" once every level has
 * either arrived or failed; a level that failed reads as undefined in `plans`.
 */
function useLevelPlans(ids: readonly PlanLevelId[]): { status: 'loading' | 'ready'; plans: Map<PlanLevelId, Plan3D | null | undefined> } {
  const key = levelKey(ids);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  // Bumped when a fetch this hook waited on lands, so `plans` is rebuilt from the cache.
  const [tick, bump] = useState(0);

  useEffect(() => {
    const wanted = key ? (key.split(',') as PlanLevelId[]) : [];
    const pending = wanted.filter((id) => !settled.has(id));
    if (pending.length === 0) {
      setDoneKey(key);
      return;
    }
    let cancelled = false;
    Promise.all(pending.map((id) => getPlan3D(id).catch(() => undefined))).then(() => {
      if (cancelled) return;
      bump((n) => n + 1);
      setDoneKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const plans = useMemo(() => {
    const wanted = key ? (key.split(',') as PlanLevelId[]) : [];
    return new Map<PlanLevelId, Plan3D | null | undefined>(wanted.map((id) => [id, settled.get(id)]));
  }, [key, tick]);
  const allSettled = ids.every((id) => settled.has(id));
  const status: 'loading' | 'ready' = allSettled || doneKey === key ? 'ready' : 'loading';
  return { status, plans };
}

export type ResidenceAreaState = {
  /** "none": no registered residence matches, or no sheet it spans has 3D data. */
  status: 'loading' | 'ready' | 'none';
  levels: LevelArea[];
  netSqm?: number;
  outdoorSqm?: number;
  complete: boolean;
};

/**
 * Measured area of one residence by its registered code ("3 A1", "0/1 B"). Fetches the model of
 * every level the registry says it spans; sums only when every one of them is complete.
 */
export function useResidenceArea(code: string | null | undefined): ResidenceAreaState {
  const unit = useMemo(() => matchResidence(null, code), [code]);
  const ids = useMemo(() => (unit ? residenceLevels(unit).map((l) => l.id) : []), [unit]);
  const { status, plans } = useLevelPlans(ids);
  return useMemo(() => {
    if (!unit) return { status: 'none', levels: [], complete: false };
    const area = residenceArea(unit, plans);
    if (status === 'loading') return { status: 'loading', levels: area.levels, complete: false };
    const anyData = ids.some((id) => plans.get(id));
    return {
      status: anyData ? 'ready' : 'none',
      levels: area.levels,
      netSqm: area.netSqm,
      outdoorSqm: area.outdoorSqm,
      complete: area.complete,
    };
  }, [unit, ids, status, plans]);
}

/** Measured areas for a list of residences (an explorer floor, a plan-level card). */
export function useResidenceAreas(units: readonly UnitRecord[]): { status: 'loading' | 'ready'; byCode: Map<string, UnitArea> } {
  const ids = useMemo(() => {
    const set = new Set<PlanLevelId>();
    for (const unit of units) for (const level of residenceLevels(unit)) set.add(level.id);
    return [...set];
  }, [units]);
  const { status, plans } = useLevelPlans(ids);
  const byCode = useMemo(() => {
    const map = new Map<string, UnitArea>();
    for (const unit of units) map.set(unit.apartment, residenceArea(unit, plans));
    return map;
  }, [units, plans]);
  return { status, byCode };
}

/** Measured area of one registry record; null while loading or when there is no record. */
export function useUnitArea(unit: UnitRecord | null | undefined): UnitArea | null {
  const units = useMemo(() => (unit ? [unit] : []), [unit]);
  const { status, byCode } = useResidenceAreas(units);
  if (!unit || status !== 'ready') return null;
  return byCode.get(unit.apartment) ?? null;
}
