// 3D floor-plan geometry extracted from the as-built DXF sheets by scripts/extract_plan3d.py.
// One JSON per level at /plans/level-<id>.3d.json. All coordinates are metres in the
// drawing's model space (x right, y up on paper); the renderer maps y -> -z (Y-up world).

export type Pt = [number, number];
/** Closed polygon ring (first point not repeated). Winding is not guaranteed. */
export type Ring = Pt[];
/** Line segment x1, y1, x2, y2. */
export type Seg = [number, number, number, number];

export type FurnitureKind =
  | 'bed'
  | 'sofa'
  | 'table'
  | 'chair'
  | 'kitchen'
  | 'closet'
  | 'bath'
  | 'wc'
  | 'sink'
  | 'fridge'
  | 'oven'
  | 'plant'
  | 'generic';

export type Plan3D = {
  level: string;
  units: 'm';
  /** xmin, ymin, xmax, ymax of the plan content. */
  bbox: [number, number, number, number];
  /** Slab outline(s). Each ring is one continuous floor plate; courtyard is simply outside. */
  footprint: Ring[];
  /** Solid walls from the wall/concrete hatch boundaries — extruded full height. */
  wallPolys: { ring: Ring; holes?: Ring[]; kind: 'structural' | 'partition' }[];
  /** Thin partitions / plaster lines with no hatch — rendered ~0.12 m thick. */
  wallLines: Seg[];
  /** Glazing lines — rendered as glass between sill (0.9 m) and head (2.3 m). */
  windows: Seg[];
  /** Door leaves: hinge position, rotation in degrees, leaf width. */
  doors: { x: number; y: number; rot: number; width: number }[];
  /** Furniture volumes as axis-aligned boxes (xmin, ymin, xmax, ymax) with optional rotation about the box centre. */
  furniture: { box: [number, number, number, number]; rot?: number; kind: FurnitureKind; height: number }[];
  /** Stair tread lines. */
  stairs: Seg[];
  /** Rooms from the drawing's nomenclature layer. `ring` is the enclosed room polygon when the wall
   *  network closes around the label (polygonized from walls + glazing); `floor` is inferred from
   *  the room's name; `apartment` is the registered code whose tag sits inside the room. */
  rooms: {
    name: string;
    x: number;
    y: number;
    ring?: Ring;
    floor?: 'oak' | 'tile' | 'stone' | 'outdoor';
    /** Registered residence code this room belongs to — from the tag drawn inside it, or inferred
     *  from the wall/door network (see `apartments[].source`). Absent when unknown. */
    apartment?: string;
    /** Net internal floor area in m² measured from `ring` (one decimal); absent without a ring. */
    area?: number;
  }[];
  /**
   * The residences present on this level, e.g. "3 A1" — the registered codes. `x, y` is the pin
   * anchor (the tag as drawn, or the footprint's pole of inaccessibility when inferred). Area totals
   * are measured from the as-built room polygons on THIS level only — a duplex sums across its two
   * sheets — and are given only when the footprint is complete.
   */
  apartments?: {
    code: string;
    block: 'A' | 'B' | 'C';
    x: number;
    y: number;
    /** Rooms on this level assigned to the residence. */
    rooms?: number;
    /** Net internal area on this level, m² — indoor rooms with rings, summed. */
    areaSqm?: number;
    /** Outdoor area on this level, m² — terraces, balconies, gardens assigned to the residence. */
    outdoorSqm?: number;
    /** True when every room of the residence on this level is enclosed and assigned, so totals are reliable. */
    complete?: boolean;
    /** How the footprint was found: the code text on the sheet, or the registry + door graph. */
    source?: 'tag' | 'inferred';
  }[];
  /** Typed area zones drawn on the sheet: parking aprons, ramps, pools, gardens, terraces. */
  zones?: { kind: 'parking' | 'ramp' | 'water' | 'garden' | 'terrace' | 'plant'; ring: Ring; label?: string }[];
  /** Parking bays (basement levels), as painted-line rectangles. */
  bays?: { box: [number, number, number, number]; rot?: number; label?: string }[];
  /** Capacity as written on the sheet, e.g. "CAR PARK (46 CARS)" -> 46. */
  parkingCapacity?: number;
  /** Structural columns as centre + size, when drawn as free-standing concrete. */
  columns?: { x: number; y: number; w: number; d: number; round?: boolean }[];
  /** Vertical shafts (voids through the slab). */
  shafts: Ring[];
  /** Trees / planting on this level (ground + roof gardens). */
  trees: { x: number; y: number; r: number }[];
};

/**
 * The registered residence code a parking-bay label tags, normalised to the registry's form
 * ("9/10 C1", "6C1" -> "6 C1", "5/6 B", "4 A2 (extra)" -> "4 A2"); null for shared bays ("POOL",
 * "Shared", "Accessible"), unlabelled bays and noise.
 */
export function bayResidenceCode(label: string | undefined): string | null {
  if (!label) return null;
  const bare = label.trim().toUpperCase().replace(/\s*\(.*\)$/, '');
  const m = /^(\d+(?:\/\d+)?)\s*([ABC])\s*(\d?)$/.exec(bare);
  if (!m) return null;
  return `${m[1]} ${m[2]}${m[3]}`;
}

/** A residence's entry on a level, if the sheet carries it. */
export function apartmentOnLevel(plan: Plan3D | null | undefined, code: string): NonNullable<Plan3D['apartments']>[number] | null {
  if (!plan?.apartments) return null;
  return plan.apartments.find((a) => a.code === code) ?? null;
}

/** Plant-room names on the basement sheets that make up "Generator / plant rooms". */
export const PLANT_ROOM = /generator|electrical|pump|water tank|boiler|transformer/i;

export function plan3dUrl(levelId: string): string {
  return `/plans/level-${levelId}.3d.json`;
}

/** Fetch a level's 3D geometry; resolves null when the level has no 3D data (404). */
export async function loadPlan3D(levelId: string, signal?: AbortSignal): Promise<Plan3D | null> {
  const res = await fetch(plan3dUrl(levelId), { signal });
  if (!res.ok) return null;
  return (await res.json()) as Plan3D;
}
