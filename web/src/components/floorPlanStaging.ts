// Illustrative furniture staging for the 3D floor-plan viewer.
//
// Nothing here comes from the drawing set. Each room that closed into a ring is staged from
// its name and that real ring — deterministically, so the model looks identical every mount —
// purely so a floor reads at a glance ("that's a bedroom, that's the living room"). The drawn
// fixtures (baths, closets, counters…) keep their authority: staging is placed only in the
// free area around them, off the walls, out of window lines and door swings.
//
// This module is pure geometry: it returns footprints in plan coordinates. FloorPlan3D turns
// them into meshes in a lighter, calmer palette than the fixtures so they never pass for survey.

import type { Plan3D, Pt, Ring, Seg } from '../data/floorPlan3d';

export type StagedKind =
  | 'bed'
  | 'nightstand'
  | 'wardrobe'
  | 'rug'
  | 'sofa'
  | 'armchair'
  | 'coffeeTable'
  | 'tvUnit'
  | 'plant'
  | 'diningTable'
  | 'chair'
  | 'sideboard'
  | 'desk'
  | 'bookshelf'
  | 'lounger'
  | 'roundTable';

export type StagedPiece = {
  kind: StagedKind;
  /** Plan centre of the footprint. */
  x: number;
  y: number;
  /** Plan angle (radians, CCW from +x) the piece's front faces; its back is the wall side. */
  facing: number;
  /** Footprint in metres: `w` across the facing, `d` along it. */
  w: number;
  d: number;
};

/* ------------------------------------------------------------------ */
/*  Tunables                                                            */
/* ------------------------------------------------------------------ */

/** Placement grid pitch. */
const GRID = 0.25;
/** Free area starts this far inside the room's walls. */
const INSET = 0.35;
/** …and this far off any window line. */
const WIN_CLEAR = 0.25;
/** Clear radius around a door hinge (the leaf's swing). */
const DOOR_CLEAR = 1.0;
/** Drawn fixtures and columns are grown by this before blocking cells. */
const FIXTURE_MARGIN = 0.08;
/** Rugs may run closer to the walls than furniture. */
const RUG_INSET = 0.15;
/** A wall-hugging piece must have its back within INSET + this of a wall. */
const HUG_SLACK = 0.3;
/** …and, when strict, no window within this of its back. */
const HUG_WINDOW_FREE = 0.6;
/** Rooms narrower than this in either direction are left bare. */
const MIN_ROOM_SIDE = 1.6;

const BED_D = 2.0;
const NIGHTSTAND = 0.45;
const CHAIR = 0.45;

/* Room sets by name. Bath / service spaces never stage, whatever else the name says. */
const NEVER_STAGED = /bath|toilet|wc|shower|closet|dressing|lobby|corridor|hall|stor|void|planter|technical|laundry|sas|duct|shaft/i;
const BEDROOM = /master bedroom|^bedroom|guest|maid(?:'s)?(?: bed)?room|^maid(?:'s)?$/i;
const LIVING = /living|salon|family|lounge|reception/i;
const DINING = /dining/i;
const OFFICE = /office|study|library/i;
const KITCHEN = /kitchen/i;
const OUTDOOR = /terrace|balcony/i;

/* ------------------------------------------------------------------ */
/*  Plan geometry                                                       */
/* ------------------------------------------------------------------ */

function cleanRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-4 && Math.abs(last[1] - p[1]) < 1e-4) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) out.pop();
  }
  return out;
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}

function ringBBox(ring: Ring): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function distToRing(px: number, py: number, ring: Ring): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distToSeg(px, py, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Oriented rectangle: centre, unit long axis `u` (its perpendicular `v` is (-uy, ux)), extents. */
type Frame = { cx: number; cy: number; ux: number; uy: number; len: number; wid: number };

/**
 * Oriented bounding rectangle by rotating calipers over the ring's own edge directions. Rooms are
 * rectilinear with the odd chamfer or splayed wall, so the orientation carrying the most wall
 * length wins unless it is clearly worse than the minimum-area one.
 */
function orientedRect(ring: Ring): Frame | null {
  type Candidate = { frame: Frame; area: number; wallLen: number };
  const candidates: Candidate[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ex = ring[i][0] - ring[j][0];
    const ey = ring[i][1] - ring[j][1];
    const l = Math.hypot(ex, ey);
    if (l < 0.05) continue;
    const ux = ex / l;
    const uy = ey / l;
    // fold onto an existing candidate when parallel or perpendicular to it
    const same = candidates.find((c) => {
      const dot = Math.abs(c.frame.ux * ux + c.frame.uy * uy);
      return dot > 0.999 || dot < 0.001;
    });
    if (same) {
      same.wallLen += l;
      continue;
    }
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, y] of ring) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    candidates.push({
      frame: { cx: um * ux - vm * uy, cy: um * uy + vm * ux, ux, uy, len: u1 - u0, wid: v1 - v0 },
      area: (u1 - u0) * (v1 - v0),
      wallLen: l,
    });
  }
  if (candidates.length === 0) return null;
  let minArea = Infinity;
  for (const c of candidates) if (c.area < minArea) minArea = c.area;
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (c.area > minArea * 1.3) continue;
    if (!best || c.wallLen > best.wallLen + 1e-6) best = c;
  }
  let frame = (best ?? candidates[0]).frame;
  // the long axis is always u
  if (frame.wid > frame.len) frame = { ...frame, ux: -frame.uy, uy: frame.ux, len: frame.wid, wid: frame.len };
  return frame;
}

/* ------------------------------------------------------------------ */
/*  Blockers                                                            */
/* ------------------------------------------------------------------ */

/** A rotated rectangle blocker (drawn fixture or column), already grown by the margin. */
type RectBlocker = { cx: number; cy: number; ux: number; uy: number; hw: number; hd: number };

type Blockers = {
  /** Window lines on this room's boundary. */
  windows: Seg[];
  /** Hinges of doors opening on this room. */
  doors: Pt[];
  rects: RectBlocker[];
};

function inRect(px: number, py: number, r: RectBlocker): boolean {
  const dx = px - r.cx;
  const dy = py - r.cy;
  const lu = dx * r.ux + dy * r.uy;
  const lv = -dx * r.uy + dy * r.ux;
  return Math.abs(lu) <= r.hw && Math.abs(lv) <= r.hd;
}

function collectBlockers(plan: Plan3D, ring: Ring): Blockers {
  const [x0, y0, x1, y1] = ringBBox(ring);
  const near = (x: number, y: number, pad: number): boolean => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  const windows = plan.windows.filter((s) => {
    const mx = (s[0] + s[2]) / 2;
    const my = (s[1] + s[3]) / 2;
    return near(mx, my, 0.4) && distToRing(mx, my, ring) <= 0.3;
  });
  const doors: Pt[] = [];
  for (const d of plan.doors) {
    if (!(d.width > 0.2) || !near(d.x, d.y, 0.5)) continue;
    if (pointInRing(d.x, d.y, ring) || distToRing(d.x, d.y, ring) <= 0.35) doors.push([d.x, d.y]);
  }
  const rects: RectBlocker[] = [];
  for (const f of plan.furniture) {
    const [bx0, by0, bx1, by1] = f.box;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    if (!near(cx, cy, 1)) continue;
    const rot = ((f.rot ?? 0) * Math.PI) / 180;
    rects.push({ cx, cy, ux: Math.cos(rot), uy: Math.sin(rot), hw: (bx1 - bx0) / 2 + FIXTURE_MARGIN, hd: (by1 - by0) / 2 + FIXTURE_MARGIN });
  }
  for (const c of plan.columns ?? []) {
    if (!near(c.x, c.y, 0.5)) continue;
    rects.push({ cx: c.x, cy: c.y, ux: 1, uy: 0, hw: c.w / 2 + FIXTURE_MARGIN, hd: c.d / 2 + FIXTURE_MARGIN });
  }
  return { windows, doors, rects };
}

function hasDrawnCloset(plan: Plan3D, ring: Ring): boolean {
  return plan.furniture.some((f) => f.kind === 'closet' && pointInRing((f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2, ring));
}

/* ------------------------------------------------------------------ */
/*  Room grid                                                           */
/* ------------------------------------------------------------------ */

/** Facing directions in the room frame: 0 → +u, 1 → +v, 2 → -u, 3 → -v. */
const ALONG: ReadonlyArray<Pt> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
/** A piece's own right-hand side (its local +x once rendered) for each facing. */
const LATERAL: ReadonlyArray<Pt> = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
const ALL_F: readonly number[] = [0, 1, 2, 3];

/** A run of grid cells claimed for a piece, with the piece centre in room coordinates. */
type Block = { i0: number; j0: number; ci: number; cj: number; f: number; u: number; v: number };
type Score = (b: Block) => number | null;

/**
 * The room's oriented rectangle rasterised at GRID: which vertices lie in free area, how far
 * each is from the walls and the windows, and which cells staging has already claimed.
 * Summed-area tables make "is this block free?" O(1).
 */
class RoomGrid {
  readonly frame: Frame;
  readonly ring: Ring;
  readonly nu: number;
  readonly nv: number;
  private readonly s: number;
  private readonly free: Uint8Array;
  private readonly rugOk: Uint8Array;
  private readonly dWall: Float32Array;
  private readonly dWin: Float32Array;
  private readonly occ: Uint8Array;
  private readonly satFree: Int32Array;
  private readonly satRug: Int32Array;

  constructor(frame: Frame, ring: Ring, blockers: Blockers) {
    this.frame = frame;
    this.ring = ring;
    this.nu = Math.max(1, Math.ceil(frame.len / GRID - 1e-6));
    this.nv = Math.max(1, Math.ceil(frame.wid / GRID - 1e-6));
    this.s = this.nv + 1;
    const nVerts = (this.nu + 1) * this.s;
    this.free = new Uint8Array(nVerts);
    this.rugOk = new Uint8Array(nVerts);
    this.dWall = new Float32Array(nVerts);
    this.dWin = new Float32Array(nVerts);
    this.occ = new Uint8Array(this.nu * this.nv);
    this.satFree = new Int32Array(nVerts);
    this.satRug = new Int32Array(nVerts);
    for (let i = 0; i <= this.nu; i++) {
      for (let j = 0; j <= this.nv; j++) {
        const k = i * this.s + j;
        const [x, y] = this.toPlan(-frame.len / 2 + i * GRID, -frame.wid / 2 + j * GRID);
        if (!pointInRing(x, y, ring)) continue;
        const dw = distToRing(x, y, ring);
        let dwin = Infinity;
        for (const w of blockers.windows) {
          const d = distToSeg(x, y, w[0], w[1], w[2], w[3]);
          if (d < dwin) dwin = d;
        }
        this.dWall[k] = dw;
        this.dWin[k] = dwin;
        const door = blockers.doors.some(([hx, hy]) => Math.hypot(x - hx, y - hy) < DOOR_CLEAR);
        const fixture = blockers.rects.some((r) => inRect(x, y, r));
        if (door || fixture) continue;
        if (dw >= INSET && dwin >= WIN_CLEAR) this.free[k] = 1;
        if (dw >= RUG_INSET && dwin >= RUG_INSET) this.rugOk[k] = 1;
      }
    }
    this.buildSat(this.satRug, (i, j) => (this.cellClear(this.rugOk, i, j) ? 0 : 1));
    this.rebuild();
  }

  toPlan(u: number, v: number): Pt {
    const f = this.frame;
    return [f.cx + f.ux * u - f.uy * v, f.cy + f.uy * u + f.ux * v];
  }

  private cellClear(flags: Uint8Array, i: number, j: number): boolean {
    const k = i * this.s + j;
    return flags[k] === 1 && flags[k + 1] === 1 && flags[k + this.s] === 1 && flags[k + this.s + 1] === 1;
  }

  private buildSat(sat: Int32Array, blocked: (i: number, j: number) => number): void {
    sat.fill(0);
    for (let i = 1; i <= this.nu; i++) {
      let row = 0;
      for (let j = 1; j <= this.nv; j++) {
        row += blocked(i - 1, j - 1);
        sat[i * this.s + j] = sat[(i - 1) * this.s + j] + row;
      }
    }
  }

  private rebuild(): void {
    this.buildSat(this.satFree, (i, j) => (this.occ[i * this.nv + j] === 0 && this.cellClear(this.free, i, j) ? 0 : 1));
  }

  private blocked(sat: Int32Array, i0: number, j0: number, ci: number, cj: number): boolean {
    const s = this.s;
    return sat[(i0 + ci) * s + j0 + cj] - sat[i0 * s + j0 + cj] - sat[(i0 + ci) * s + j0] + sat[i0 * s + j0] > 0;
  }

  snapshot(): Uint8Array {
    return this.occ.slice();
  }

  restore(snap: Uint8Array): void {
    this.occ.set(snap);
    this.rebuild();
  }

  /** Claim the block's cells so later pieces keep off it. */
  commit(b: Block): void {
    for (let i = b.i0; i < b.i0 + b.ci; i++) for (let j = b.j0; j < b.j0 + b.cj; j++) this.occ[i * this.nv + j] = 1;
    this.rebuild();
  }

  /**
   * Greedy scan: every free block that fits a `w` × `d` footprint at each allowed facing, scored;
   * the lowest score wins (first found on ties, so the result is deterministic).
   */
  place(w: number, d: number, facings: readonly number[], score: Score, uRange?: Pt): Block | null {
    const { len, wid } = this.frame;
    const iLo = uRange ? Math.max(0, Math.ceil((uRange[0] + len / 2) / GRID - 1e-6)) : 0;
    const iHi = uRange ? Math.min(this.nu, Math.floor((uRange[1] + len / 2) / GRID + 1e-6)) : this.nu;
    let best: Block | null = null;
    let bestScore = Infinity;
    for (const f of facings) {
      const eu = f % 2 === 0 ? d : w;
      const ev = f % 2 === 0 ? w : d;
      const ci = Math.ceil(eu / GRID - 1e-6);
      const cj = Math.ceil(ev / GRID - 1e-6);
      for (let i0 = iLo; i0 + ci <= iHi; i0++) {
        for (let j0 = 0; j0 + cj <= this.nv; j0++) {
          if (this.blocked(this.satFree, i0, j0, ci, cj)) continue;
          const b: Block = { i0, j0, ci, cj, f, u: -len / 2 + (i0 + ci / 2) * GRID, v: -wid / 2 + (j0 + cj / 2) * GRID };
          const s = score(b);
          if (s === null || s >= bestScore) continue;
          bestScore = s;
          best = b;
        }
      }
    }
    return best;
  }

  /** The block covering a `w` × `d` footprint centred exactly at (u, v), if it is free. */
  tryAt(w: number, d: number, f: number, u: number, v: number, rug = false): Block | null {
    const { len, wid } = this.frame;
    const eu = f % 2 === 0 ? d : w;
    const ev = f % 2 === 0 ? w : d;
    const i0 = Math.floor((u - eu / 2 + len / 2) / GRID + 1e-6);
    const i1 = Math.ceil((u + eu / 2 + len / 2) / GRID - 1e-6);
    const j0 = Math.floor((v - ev / 2 + wid / 2) / GRID + 1e-6);
    const j1 = Math.ceil((v + ev / 2 + wid / 2) / GRID - 1e-6);
    if (i0 < 0 || j0 < 0 || i1 > this.nu || j1 > this.nv || i1 <= i0 || j1 <= j0) return null;
    if (this.blocked(rug ? this.satRug : this.satFree, i0, j0, i1 - i0, j1 - j0)) return null;
    return { i0, j0, ci: i1 - i0, cj: j1 - j0, f, u, v };
  }

  /** Mean wall distance and least window distance along the block's back edge. */
  backStats(b: Block): { wall: number; win: number } {
    let wall = 0;
    let win = Infinity;
    let n = 0;
    const visit = (i: number, j: number): void => {
      const k = i * this.s + j;
      wall += this.dWall[k];
      if (this.dWin[k] < win) win = this.dWin[k];
      n++;
    };
    if (b.f === 0) for (let j = b.j0; j <= b.j0 + b.cj; j++) visit(b.i0, j);
    else if (b.f === 2) for (let j = b.j0; j <= b.j0 + b.cj; j++) visit(b.i0 + b.ci, j);
    else if (b.f === 1) for (let i = b.i0; i <= b.i0 + b.ci; i++) visit(i, b.j0);
    else for (let i = b.i0; i <= b.i0 + b.ci; i++) visit(i, b.j0 + b.cj);
    return { wall: wall / Math.max(1, n), win };
  }

  /** Block extent along its facing, in metres. */
  alongExtent(b: Block): number {
    return (b.f % 2 === 0 ? b.ci : b.cj) * GRID;
  }

  lateralExtent(b: Block): number {
    return (b.f % 2 === 0 ? b.cj : b.ci) * GRID;
  }
}

/* ------------------------------------------------------------------ */
/*  Scoring                                                             */
/* ------------------------------------------------------------------ */

/** Back against a wall, ideally one without a window behind, centred on `latCentre` across it. */
function hugScore(grid: RoomGrid, strict: boolean, centre: Pt): Score {
  return (b) => {
    const s = grid.backStats(b);
    if (s.wall - INSET > HUG_SLACK) return null;
    if (strict && s.win < HUG_WINDOW_FREE) return null;
    const lat = LATERAL[b.f];
    const off = Math.abs((b.u - centre[0]) * lat[0] + (b.v - centre[1]) * lat[1]);
    return s.wall + 0.05 * off + (s.win < HUG_WINDOW_FREE ? 1 : 0);
  };
}

function centreScore(centre: Pt): Score {
  return (b) => Math.hypot(b.u - centre[0], b.v - centre[1]);
}

/** Back edge as close as possible to one particular wall segment. */
function edgeScore(grid: RoomGrid, seg: Seg): Score {
  return (b) => {
    const a = ALONG[b.f];
    const half = grid.alongExtent(b) / 2;
    const [x, y] = grid.toPlan(b.u - a[0] * half, b.v - a[1] * half);
    const dist = distToSeg(x, y, seg[0], seg[1], seg[2], seg[3]);
    return dist > INSET + HUG_SLACK + 0.1 ? null : dist;
  };
}

/** The longest ring edge with no window and no door on it, long enough for a `minLen` headboard. */
function headboardWall(ring: Ring, blockers: Blockers, minLen: number): Seg | null {
  let best: Seg | null = null;
  let bestLen = 0;
  let fallback: Seg | null = null;
  let fallbackLen = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const seg: Seg = [ring[j][0], ring[j][1], ring[i][0], ring[i][1]];
    const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    if (len < minLen) continue;
    const hasDoor = blockers.doors.some(([hx, hy]) => distToSeg(hx, hy, seg[0], seg[1], seg[2], seg[3]) < 0.5);
    if (hasDoor) continue;
    const hasWindow = blockers.windows.some((w) => distToSeg((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, seg[0], seg[1], seg[2], seg[3]) < 0.35);
    if (!hasWindow && len > bestLen) {
      best = seg;
      bestLen = len;
    } else if (hasWindow && len > fallbackLen) {
      fallback = seg;
      fallbackLen = len;
    }
  }
  return best ?? fallback;
}

/** The room-frame facing that points into the room from this wall segment. */
function facingFromWall(grid: RoomGrid, seg: Seg): number {
  const ex = seg[2] - seg[0];
  const ey = seg[3] - seg[1];
  const l = Math.hypot(ex, ey) || 1;
  let nx = -ey / l;
  let ny = ex / l;
  const mx = (seg[0] + seg[2]) / 2;
  const my = (seg[1] + seg[3]) / 2;
  if (!pointInRing(mx + nx * 0.3, my + ny * 0.3, grid.ring)) {
    nx = -nx;
    ny = -ny;
  }
  const { ux, uy } = grid.frame;
  // facing directions in plan: +u, +v, -u, -v
  const dirs: Pt[] = [
    [ux, uy],
    [-uy, ux],
    [-ux, -uy],
    [uy, -ux],
  ];
  let best = 0;
  let bestDot = -Infinity;
  dirs.forEach(([dx, dy], f) => {
    const dot = dx * nx + dy * ny;
    if (dot > bestDot) {
      bestDot = dot;
      best = f;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ */
/*  Room sets                                                           */
/* ------------------------------------------------------------------ */

class Stager {
  private readonly grid: RoomGrid;
  private readonly blockers: Blockers;
  private readonly out: StagedPiece[];
  private readonly theta: number;

  constructor(grid: RoomGrid, blockers: Blockers, out: StagedPiece[]) {
    this.grid = grid;
    this.blockers = blockers;
    this.out = out;
    this.theta = Math.atan2(grid.frame.uy, grid.frame.ux);
  }

  private emit(kind: StagedKind, u: number, v: number, f: number, w: number, d: number): void {
    const [x, y] = this.grid.toPlan(u, v);
    this.out.push({ kind, x, y, facing: this.theta + (f * Math.PI) / 2, w, d });
  }

  /** Room-frame point at a local offset from a block: `lx` to the piece's right, `lz` toward its front. */
  private local(b: Block, lx: number, lz: number): Pt {
    const a = ALONG[b.f];
    const l = LATERAL[b.f];
    return [b.u + l[0] * lx + a[0] * lz, b.v + l[1] * lx + a[1] * lz];
  }

  private hug(w: number, d: number, centre: Pt, uRange?: Pt, facings: readonly number[] = ALL_F): Block | null {
    return (
      this.grid.place(w, d, facings, hugScore(this.grid, true, centre), uRange) ??
      this.grid.place(w, d, facings, hugScore(this.grid, false, centre), uRange)
    );
  }

  bedroom(name: string, hasCloset: boolean): void {
    const grid = this.grid;
    const bedW = /master/i.test(name) ? 1.8 : /maid|guest/i.test(name) ? 1.2 : 1.5;
    let bed: Block | null = null;
    const wall = headboardWall(grid.ring, this.blockers, bedW + 0.2);
    if (wall) bed = grid.place(bedW, BED_D, [facingFromWall(grid, wall)], edgeScore(grid, wall));
    if (!bed) bed = this.hug(bedW, BED_D, [0, 0]);
    if (!bed) return;
    grid.commit(bed);
    this.emit('bed', bed.u, bed.v, bed.f, bedW, BED_D);

    if (bedW >= 1.5) {
      const lateral = grid.lateralExtent(bed) / 2 + NIGHTSTAND / 2 + 0.02;
      const along = -grid.alongExtent(bed) / 2 + NIGHTSTAND / 2;
      for (const side of [-1, 1]) {
        const [u, v] = this.local(bed, side * lateral, along);
        const ns = grid.tryAt(NIGHTSTAND, NIGHTSTAND, bed.f, u, v);
        if (!ns) continue;
        grid.commit(ns);
        this.emit('nightstand', u, v, bed.f, NIGHTSTAND, NIGHTSTAND);
      }
    }

    if (!hasCloset) {
      for (const w of [1.8, 1.2]) {
        const wardrobe = this.hug(w, 0.6, [0, 0]);
        if (!wardrobe) continue;
        grid.commit(wardrobe);
        this.emit('wardrobe', wardrobe.u, wardrobe.v, wardrobe.f, w, 0.6);
        break;
      }
    }

    // rug: flush with the headboard, a border past the sides and the foot
    for (const [rw, rd, shift] of [
      [bedW + 1.0, BED_D + 0.4, 0.2],
      [bedW + 0.6, BED_D, 0],
    ]) {
      const [u, v] = this.local(bed, 0, shift);
      if (!grid.tryAt(rw, rd, bed.f, u, v, true)) continue;
      this.emit('rug', u, v, bed.f, rw, rd);
      break;
    }
  }

  living(uRange: Pt): void {
    const grid = this.grid;
    const centre: Pt = [(uRange[0] + uRange[1]) / 2, 0];
    type Combo = { score: number; f: number; tv: Block; sofa: Block; occ: Uint8Array };
    let best: Combo | null = null;
    const snap = grid.snapshot();
    for (const f of ALL_F) {
      const tv = this.hug(1.6, 0.45, centre, uRange, [f]);
      if (!tv) continue;
      grid.commit(tv);
      const a = ALONG[f];
      const l = LATERAL[f];
      const tvFront = tv.u * a[0] + tv.v * a[1] + grid.alongExtent(tv) / 2;
      const tvLat = tv.u * l[0] + tv.v * l[1];
      const sofa = grid.place(
        2.2,
        0.9,
        [(f + 2) % 4],
        (b) => {
          const gap = b.u * a[0] + b.v * a[1] - grid.alongExtent(b) / 2 - tvFront;
          if (gap < 1.4 || gap > 4.5) return null;
          const mis = Math.abs(b.u * l[0] + b.v * l[1] - tvLat);
          if (mis > 1) return null;
          return Math.abs(gap - 2.6) + 0.6 * mis;
        },
        uRange,
      );
      if (sofa) {
        grid.commit(sofa);
        const score = Math.abs(sofa.u * a[0] + sofa.v * a[1] - grid.alongExtent(sofa) / 2 - tvFront - 2.6) + (grid.backStats(tv).win < HUG_WINDOW_FREE ? 0.5 : 0);
        if (!best || score < best.score) best = { score, f, tv, sofa, occ: grid.snapshot() };
      }
      grid.restore(snap);
    }

    let sofa: Block;
    let front: Pt;
    if (best) {
      grid.restore(best.occ);
      this.emit('tvUnit', best.tv.u, best.tv.v, best.tv.f, 1.6, 0.45);
      this.emit('sofa', best.sofa.u, best.sofa.v, best.sofa.f, 2.2, 0.9);
      sofa = best.sofa;
      const a = ALONG[best.f];
      const tvFront = best.tv.u * a[0] + best.tv.v * a[1] + grid.alongExtent(best.tv) / 2;
      const sofaFront = sofa.u * a[0] + sofa.v * a[1] - grid.alongExtent(sofa) / 2;
      // the coffee table sits between the two fronts, on the sofa's axis
      const mid = (tvFront + sofaFront) / 2;
      const l = LATERAL[best.f];
      const lat = sofa.u * l[0] + sofa.v * l[1];
      front = [a[0] * mid + l[0] * lat, a[1] * mid + l[1] * lat];
    } else {
      const only = this.hug(2.2, 0.9, centre, uRange);
      if (!only) return;
      grid.commit(only);
      this.emit('sofa', only.u, only.v, only.f, 2.2, 0.9);
      sofa = only;
      front = this.local(only, 0, grid.alongExtent(only) / 2 + 0.75);
    }

    let coffee: Block | null = null;
    for (const back of [0, 0.25, 0.5]) {
      const a = ALONG[sofa.f];
      const u = front[0] - a[0] * back;
      const v = front[1] - a[1] * back;
      coffee = grid.tryAt(1.1, 0.6, sofa.f, u, v);
      if (coffee) break;
    }
    if (coffee) {
      grid.commit(coffee);
      this.emit('coffeeTable', coffee.u, coffee.v, coffee.f, 1.1, 0.6);
      // one armchair beside the table, turned to face it
      for (const side of [1, -1]) {
        const [u, v] = this.local(coffee, side * (0.55 + 0.425 + 0.35), 0);
        const f = side > 0 ? (sofa.f + 3) % 4 : (sofa.f + 1) % 4;
        const chair = grid.tryAt(0.85, 0.85, f, u, v);
        if (!chair) continue;
        grid.commit(chair);
        this.emit('armchair', u, v, f, 0.85, 0.85);
        break;
      }
    }

    const rugAt: Pt = coffee ? [coffee.u, coffee.v] : front;
    for (const [rw, rd] of [
      [3, 2],
      [2.4, 1.6],
    ]) {
      if (!grid.tryAt(rw, rd, sofa.f, rugAt[0], rugAt[1], true)) continue;
      this.emit('rug', rugAt[0], rugAt[1], sofa.f, rw, rd);
      break;
    }

    this.plantInCorner(uRange);
  }

  private plantInCorner(uRange: Pt): void {
    const grid = this.grid;
    const pad = INSET + 0.3;
    const hv = grid.frame.wid / 2 - pad;
    const corners: Pt[] = [
      [uRange[0] + pad, -hv],
      [uRange[1] - pad, hv],
      [uRange[0] + pad, hv],
      [uRange[1] - pad, -hv],
    ];
    for (const [u, v] of corners) {
      const plant = grid.tryAt(0.5, 0.5, 0, u, v);
      if (!plant) continue;
      grid.commit(plant);
      this.emit('plant', u, v, 0, 0.5, 0.5);
      return;
    }
  }

  dining(uRange: Pt, area: number): void {
    const grid = this.grid;
    const big = area >= 16;
    const tw = big ? 2.2 : 1.6;
    const td = big ? 1.0 : 0.9;
    const perSide = big ? 3 : 2;
    const centre: Pt = [(uRange[0] + uRange[1]) / 2, 0];
    // the table and its chairs are placed as one footprint, long side across the facing
    const table = grid.place(tw, td + 2 * (CHAIR + 0.12), [1, 0], centreScore(centre), uRange);
    if (!table) return;
    grid.commit(table);
    this.emit('diningTable', table.u, table.v, table.f, tw, td);
    for (const side of [-1, 1]) {
      for (let k = 0; k < perSide; k++) {
        const lx = (k - (perSide - 1) / 2) * (tw / perSide);
        const lz = side * (td / 2 + 0.12 + CHAIR / 2);
        const [u, v] = this.local(table, lx, lz);
        this.emit('chair', u, v, side > 0 ? (table.f + 2) % 4 : table.f, CHAIR, CHAIR);
      }
    }
    const sideboard = this.hug(1.6, 0.45, centre, uRange);
    if (sideboard) {
      grid.commit(sideboard);
      this.emit('sideboard', sideboard.u, sideboard.v, sideboard.f, 1.6, 0.45);
    }
  }

  office(): void {
    const grid = this.grid;
    const deskD = 0.7;
    const blockD = deskD + 0.15 + 0.5;
    const desk = this.hug(1.4, blockD, [0, 0]);
    if (!desk) return;
    grid.commit(desk);
    const [du, dv] = this.local(desk, 0, -blockD / 2 + deskD / 2);
    this.emit('desk', du, dv, desk.f, 1.4, deskD);
    const [cu, cv] = this.local(desk, 0, blockD / 2 - 0.25);
    this.emit('chair', cu, cv, (desk.f + 2) % 4, 0.5, 0.5);
    for (const w of [1.6, 1.0]) {
      const shelf = this.hug(w, 0.35, [0, 0]);
      if (!shelf) continue;
      grid.commit(shelf);
      this.emit('bookshelf', shelf.u, shelf.v, shelf.f, w, 0.35);
      break;
    }
  }

  kitchen(): void {
    const grid = this.grid;
    const tw = 0.9;
    const td = 0.7;
    const table = grid.place(tw, td + 2 * (CHAIR + 0.12), [1, 0], centreScore([0, 0]));
    if (!table) return;
    grid.commit(table);
    this.emit('diningTable', table.u, table.v, table.f, tw, td);
    for (const side of [-1, 1]) {
      const [u, v] = this.local(table, 0, side * (td / 2 + 0.12 + CHAIR / 2));
      this.emit('chair', u, v, side > 0 ? (table.f + 2) % 4 : table.f, CHAIR, CHAIR);
    }
  }

  outdoor(): void {
    const grid = this.grid;
    const pair = grid.place(1.55, 1.6, ALL_F, centreScore([0, 0]));
    if (!pair) return;
    grid.commit(pair);
    for (const side of [-1, 1]) {
      const [u, v] = this.local(pair, side * 0.425, 0);
      this.emit('lounger', u, v, pair.f, 0.7, 1.6);
    }
    for (const side of [1, -1]) {
      const [u, v] = this.local(pair, side * (0.775 + 0.25 + 0.1), 0);
      const table = grid.tryAt(0.5, 0.5, pair.f, u, v);
      if (!table) continue;
      grid.commit(table);
      this.emit('roundTable', u, v, pair.f, 0.5, 0.5);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                         */
/* ------------------------------------------------------------------ */

/** Stage every ringed room of the plan by its name; rooms without a ring are left bare. */
export function stagePlan(plan: Plan3D): StagedPiece[] {
  const out: StagedPiece[] = [];
  const zones = plan.zones ?? [];
  const zoneRings = (kind: 'terrace' | 'water'): Ring[] =>
    zones.filter((z) => z.kind === kind).map((z) => cleanRing(z.ring)).filter((r) => r.length >= 3);
  const terraces = zoneRings('terrace');
  const water = zoneRings('water');

  for (const room of plan.rooms) {
    if (!room.ring) continue;
    const name = room.name.trim();
    if (!name || NEVER_STAGED.test(name)) continue;
    const isBed = BEDROOM.test(name);
    const isLiving = LIVING.test(name);
    const isDining = DINING.test(name);
    const isOffice = OFFICE.test(name);
    const isKitchen = KITCHEN.test(name);
    const isOutdoor = OUTDOOR.test(name);
    if (!(isBed || isLiving || isDining || isOffice || isKitchen || isOutdoor)) continue;
    const ring = cleanRing(room.ring);
    if (ring.length < 3) continue;
    if (water.some((w) => pointInRing(room.x, room.y, w))) continue;
    // terrace zones already carry planters and loungers of their own
    if (isOutdoor && !isBed && !isLiving && !isDining && terraces.some((t) => pointInRing(room.x, room.y, t))) continue;

    const frame = orientedRect(ring);
    if (!frame || frame.len < MIN_ROOM_SIDE || frame.wid < MIN_ROOM_SIDE) continue;
    const blockers = collectBlockers(plan, ring);
    const grid = new RoomGrid(frame, ring, blockers);
    const stager = new Stager(grid, blockers, out);
    const area = ringArea(ring);
    const full: Pt = [-frame.len / 2, frame.len / 2];

    if (isBed) {
      stager.bedroom(name, hasDrawnCloset(plan, ring));
    } else if (isLiving && isDining) {
      // the two halves of the rectangle: living on the side with more glazing
      let right = 0;
      let left = 0;
      for (const w of blockers.windows) {
        const mx = (w[0] + w[2]) / 2 - frame.cx;
        const my = (w[1] + w[3]) / 2 - frame.cy;
        const len = Math.hypot(w[2] - w[0], w[3] - w[1]);
        if (mx * frame.ux + my * frame.uy > 0) right += len;
        else left += len;
      }
      const livingRange: Pt = right >= left ? [0, frame.len / 2] : [-frame.len / 2, 0];
      const diningRange: Pt = right >= left ? [-frame.len / 2, 0] : [0, frame.len / 2];
      stager.living(livingRange);
      stager.dining(diningRange, area / 2);
    } else if (isLiving) {
      stager.living(full);
    } else if (isDining) {
      stager.dining(full, area);
    } else if (isOffice) {
      stager.office();
    } else if (isKitchen) {
      if (area > 12) stager.kitchen();
    } else if (isOutdoor) {
      if (area > 8) stager.outdoor();
    }
  }
  return out;
}
