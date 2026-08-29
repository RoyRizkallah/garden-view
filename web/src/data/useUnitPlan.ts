// A resident's own slice of the as-built plan set: which registered residence their portal
// unit is, the level(s) it occupies, that level's 3D model, and whatever the basement sheets
// tag to the residence (parking bays, storage cages). Pure matching helpers live beside the
// hook so they can be reasoned about — and tested — without a renderer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UnitRecord } from './buildingExplorer';
import { UNITS } from './buildingExplorer';
import type { PlanLevel, PlanLevelId } from './floorPlans';
import { planIdForFloor, planLevelById } from './floorPlans';
import type { Plan3D } from './floorPlan3d';
import { bayResidenceCode, loadPlan3D } from './floorPlan3d';

/* ---------- matching ---------- */

/**
 * Comparison form for a registered apartment code: case-insensitive, and blind to the
 * whitespace and dash/dot separators a directory entry may carry ("3 A1", "3a1", "3-A1").
 * The duplex slash is part of the code and is kept ("9/10 C2").
 */
export function canonicalCode(code: string): string {
  return code.toUpperCase().replace(/[\s\-_.]+/g, '');
}

/**
 * The registry record a portal unit refers to, or null when its registered number is not in
 * the plan set (an unknown code, a typo in the directory, or a unit the sheets never listed).
 * The block must agree when it is known: a code carries its own block letter, so a mismatch is
 * a directory inconsistency rather than a match to guess at.
 */
export function matchResidence(block: string | null | undefined, number: string | null | undefined): UnitRecord | null {
  if (!number) return null;
  const wanted = canonicalCode(number);
  if (!wanted) return null;
  const blockId = block?.trim().toUpperCase() ?? '';
  const byCode = UNITS.filter((u) => canonicalCode(u.apartment) === wanted);
  const inBlock = blockId ? byCode.filter((u) => u.block === blockId) : byCode;
  return inBlock[0] ?? null;
}

/** The residence's own residential plan levels, lowest first — one for a simplex, two for a duplex. */
export function residenceLevels(unit: UnitRecord): PlanLevel[] {
  return [...unit.floors]
    .sort((a, b) => a - b)
    .map((floor) => planLevelById(planIdForFloor(floor)))
    .filter((level): level is PlanLevel => level !== undefined);
}

/* ---------- what a sheet tags to a residence ---------- */

const BASEMENT_IDS: PlanLevelId[] = ['b1', 'b2', 'b3'];

/** A bay-label tag sits inside its bay; anything this far outside every own bay is a separate tag. */
const OWN_BAY_PAD_M = 1;

function inBox(box: [number, number, number, number], x: number, y: number, pad: number): boolean {
  return x >= box[0] - pad && x <= box[2] + pad && y >= box[1] - pad && y <= box[3] + pad;
}

export type ParkingCount = { bays: number; storage: number };

/**
 * What a basement sheet tags to a residence: its parking bays (bay labels that resolve to the
 * code) and its storage cages (apartment tags carrying the code that are not simply the label
 * of one of those bays — the extractor records a bay's painted label as an apartment tag too,
 * so a tag inside an own bay is that label, not a cage).
 */
export function parkingCountOn(plan: Plan3D, code: string): ParkingCount {
  const wanted = canonicalCode(code);
  const ownBays = (plan.bays ?? []).filter((bay) => {
    const bayCode = bayResidenceCode(bay.label);
    return bayCode !== null && canonicalCode(bayCode) === wanted;
  });
  let storage = 0;
  for (const tag of plan.apartments ?? []) {
    if (canonicalCode(tag.code) !== wanted) continue;
    if (!ownBays.some((bay) => inBox(bay.box, tag.x, tag.y, OWN_BAY_PAD_M))) storage += 1;
  }
  return { bays: ownBays.length, storage };
}

/** Whether a sheet carries the code anywhere the viewer can frame: an apartment tag, a tagged room, or an own bay. */
export function planTagsResidence(plan: Plan3D, code: string): boolean {
  const wanted = canonicalCode(code);
  if ((plan.apartments ?? []).some((tag) => canonicalCode(tag.code) === wanted)) return true;
  if (plan.rooms.some((room) => room.apartment !== undefined && canonicalCode(room.apartment) === wanted)) return true;
  return (plan.bays ?? []).some((bay) => {
    const bayCode = bayResidenceCode(bay.label);
    return bayCode !== null && canonicalCode(bayCode) === wanted;
  });
}

/* ---------- hook ---------- */

export type ParkingTag = { level: PlanLevel } & ParkingCount;

export type ParkingLoad =
  | { status: 'loading' }
  /** `incomplete` when a basement sheet could not be fetched, so an empty list is not a finding. */
  | { status: 'ready'; tags: ParkingTag[]; incomplete: boolean };

export type UnitPlanState = {
  /** The registry record, or null when the unit could not be matched to the plan set. */
  residence: UnitRecord | null;
  /** The residence's own residential levels, lowest first. */
  levels: PlanLevel[];
  /** The level on the stage — one of `levels`, or a basement reached from a parking chip. */
  level: PlanLevel | null;
  selectLevel: (id: PlanLevelId) => void;
  /** The model on the stage. While the next level loads this stays the previous model so the renderer never flashes. */
  plan: Plan3D | undefined;
  /** The stage level's model is still being fetched. */
  loading: boolean;
  /** The stage level has no 3D data (nothing to show, and `plan` should be ignored). */
  missing: boolean;
  parking: ParkingLoad;
};

type LevelEntry = { id: PlanLevelId; status: 'loading' | 'ready' | 'none' };

/**
 * Finds the resident's registry record, drives the level shown on their stage, fetches that
 * level's 3D model and reads the three basement sheets for the residence's bays and cages.
 * Every fetch is aborted on unmount; results carry the level they were fetched for so a stale
 * response is never shown.
 */
export function useUnitPlan(block: string | null | undefined, number: string | null | undefined): UnitPlanState {
  const residence = useMemo(() => matchResidence(block, number), [block, number]);
  const levels = useMemo(() => (residence ? residenceLevels(residence) : []), [residence]);
  const code = residence?.apartment ?? null;

  const [pickedId, setPickedId] = useState<PlanLevelId | null>(null);
  const defaultId = levels[0]?.id ?? null;
  const activeId = pickedId ?? defaultId;
  const level = useMemo(() => planLevelById(activeId) ?? null, [activeId]);
  const selectLevel = useCallback((id: PlanLevelId) => setPickedId(id), []);

  // Models fetched this session, by level; null records a level with no 3D data.
  const cache = useRef(new Map<PlanLevelId, Plan3D | null>());
  const [entry, setEntry] = useState<LevelEntry | null>(null);
  const [shown, setShown] = useState<{ id: PlanLevelId; plan: Plan3D } | null>(null);

  const settle = useCallback((id: PlanLevelId, plan: Plan3D | null) => {
    setEntry({ id, status: plan ? 'ready' : 'none' });
    if (plan) setShown({ id, plan });
  }, []);

  /* ---- the stage level's model ---- */
  useEffect(() => {
    if (!activeId) return;
    const cached = cache.current.get(activeId);
    if (cached !== undefined) {
      settle(activeId, cached);
      return;
    }
    const ac = new AbortController();
    setEntry({ id: activeId, status: 'loading' });
    loadPlan3D(activeId, ac.signal)
      .then((plan) => {
        if (ac.signal.aborted) return;
        cache.current.set(activeId, plan);
        settle(activeId, plan);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setEntry({ id: activeId, status: 'none' });
      });
    return () => ac.abort();
  }, [activeId, settle]);

  /* ---- the basement sheets: bays and cages tagged to the residence ---- */
  const [parking, setParking] = useState<ParkingLoad>({ status: 'loading' });
  useEffect(() => {
    if (!code) return;
    const ac = new AbortController();
    setParking({ status: 'loading' });
    const requests = BASEMENT_IDS.map((id) => {
      const cached = cache.current.get(id);
      if (cached !== undefined) return Promise.resolve({ id, ok: true as const, plan: cached });
      return loadPlan3D(id, ac.signal).then(
        (plan) => ({ id, ok: true as const, plan }),
        () => ({ id, ok: false as const, plan: null }),
      );
    });
    Promise.all(requests).then((results) => {
      if (ac.signal.aborted) return;
      const tags: ParkingTag[] = [];
      let incomplete = false;
      for (const result of results) {
        if (!result.ok) {
          incomplete = true;
          continue;
        }
        cache.current.set(result.id, result.plan);
        const lv = planLevelById(result.id);
        if (!result.plan || !lv) continue;
        const count = parkingCountOn(result.plan, code);
        if (count.bays > 0 || count.storage > 0) tags.push({ level: lv, ...count });
      }
      setParking({ status: 'ready', tags, incomplete });
    });
    return () => ac.abort();
  }, [code]);

  const current = entry !== null && activeId !== null && entry.id === activeId ? entry : null;
  const missing = current?.status === 'none';
  const loading = activeId !== null && (current === null || current.status === 'loading');

  return {
    residence,
    levels,
    level,
    selectLevel,
    plan: shown?.plan,
    loading,
    missing,
    parking,
  };
}
