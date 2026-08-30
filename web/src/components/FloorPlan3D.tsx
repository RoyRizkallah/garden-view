import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FurnitureKind, Plan3D, Pt, Ring, Seg } from '../data/floorPlan3d';
import { bayResidenceCode } from '../data/floorPlan3d';
import type { StagedPiece } from './floorPlanStaging';
import { stagePlan } from './floorPlanStaging';

export type FloorPlan3DView = 'top' | 'iso';
export type FloorPlan3DLevelKind = 'parking' | 'residential';

export type FloorPlan3DHandle = {
  /** Animate the camera to a named view (~600 ms). */
  setView: (kind: FloorPlan3DView) => void;
  /** Animate back to the default perspective framing. */
  reset: () => void;
  /**
   * Select an apartment: its rooms take a persistent gold highlight, its pin lights up and the
   * camera flies to frame its rooms. `null` clears the selection without moving the camera.
   */
  focusApartment: (code: string | null) => void;
  /** Transient hover highlight of an apartment's rooms — never moves the camera. */
  highlightApartment: (code: string | null) => void;
};

export type FloorPlan3DProps = {
  plan: Plan3D;
  levelLabel: string;
  /** Parking levels get the cool concrete mood and sealed-concrete slab; residential keeps warm daylight. */
  levelKind?: FloorPlan3DLevelKind;
  /** Fired when an apartment pin, one of an apartment's rooms, or a bay tagged to it is clicked in the model. */
  onApartmentSelect?: (code: string) => void;
  /**
   * Show the illustrative staging (beds, sofas, tables…) generated per room from its name.
   * The fixtures drawn on the sheets are always shown. Default true.
   */
  showFurniture?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180;
const WALL_H = 2.9;
/** Basement storey: walls and columns run to the soffit above the car park. */
const PARKING_WALL_H = 3.1;
const SLAB_T = 0.35;
/* Car park */
const BAY_LINE_W = 0.12;
const BAY_LINE_LIFT = 0.02;
const CAR_SHARE = 0.45;
const CAR_L = 4.3;
const CAR_W = 1.8;
const CAR_BODY_H = 0.55;
const CAR_WHEEL_R = 0.32;
const CAR_PALETTE = [0x2f3338, 0x8a8c8f, 0x5a6470, 0xd9d4cc, 0x3a4a3f, 0x6e2f2b];
const RAMP_T = 0.25;
const RAMP_SLOPE = 0.2;
const RAMP_STRIPE_W = 0.4;
const RAMP_STRIPE_STEP = 1.5;
const COLUMN_CAP_H = 0.12;
/* Water */
const POOL_DEPTH = 1.4;
const FEATURE_DEPTH = 0.35;
const WATER_LEVEL = -0.12;
const COPING_W = 0.6;
const SKYLIGHT_H = 3.8;
/* Planting */
const LOUNGE_MIN_AREA = 25;
const LINE_WALL_T = 0.12;
const SILL_H = 0.9;
const HEAD_H = 2.3;
const DOOR_H = 2.1;
const DOOR_OPEN = 70 * DEG;
const FOV = 40;
const CAM_TARGET_Y = 1.2;
const FLY_MS = 600;
/** Room floor patches sit just above the slab; highlight overlays a hair above those. */
const FLOOR_LIFT = 0.012;
const HIGHLIGHT_LIFT = 0.02;
const PIN_H = 1.4;
const GOLD = 0xc9a769;
/** Screen-space slop under which a pointer down/up pair counts as a click rather than an orbit. */
const CLICK_SLOP_PX = 5;
const CLICK_MAX_MS = 600;
/** Label density thresholds in screen pixels per metre at the orbit target. The default framing of a
 *  full floor lands around 17–19 px/m: principal rooms (living, bedrooms…) must read there, while
 *  service spaces (baths, balconies, lobbies…) wait for a closer zoom so a dense floor never piles up. */
const LABEL_MIN_PX_PER_M = 8;
const LABEL_MINOR_MIN_PX_PER_M = 24;
const MINOR_ROOM =
  /bath|wc|toilet|balcon|terrace|entrance|entry|hall|corridor|laundry|stor|closet|dressing|planter|void|shaft|elevator|lobby|lift|stair|maid|sas|duct|technical/i;
/* Label ranking: the screen-space declutter keeps the highest-ranked label wherever pills would pile up. */
const PRIORITY_PIN = 100;
const PRIORITY_KEY = 90;
const PRIORITY_PRINCIPAL = 70;
const PRIORITY_ROOM = 50;
const PRIORITY_SERVICE = 30;
/** A lit (hovered / selected / active) label outranks everything and is never hidden. */
const PRIORITY_LIT = 120;
/** Pool / reception / car-park capacity: the landmarks of a floor. */
const KEY_LABEL = /pool|water feature|reception|car park/i;
const PRINCIPAL_ROOM = /living|salon|dining|family|lounge|kitchen|bedroom|office|study|terrace/i;
/** Plant and circulation spaces: named only up close. */
const SERVICE_ROOM =
  /generator|transformer|electrical|exhaust|fresh air|water tank|fuel|collection|boiler|pump|technical|garbage|\bups\b|fm ?200|\bsas\b|shaft|duct|storage|\bstor\b|corridor|lobby|\blift\b|elevator|stair/i;
/** Screen-space slop around every label rect before testing for collisions. */
const LABEL_GAP_PX = 6;
/** Fit-in-room rule: a pill wider than this share of its room's projected width hides. */
const LABEL_FIT_SHARE = 0.95;
/** The declutter re-runs on every camera move and, idle, at most this often. */
const DECLUTTER_IDLE_MS = 120;
/* Painted bay numbers (parking levels) */
const BAY_PAINT_W = 1.7;
const BAY_PAINT_H = 0.55;
const BAY_PAINT_LIFT = 0.03;
/** Clearance between the open bay line and the painted number. */
const BAY_PAINT_INSET = 0.08;
/** Gap between a parked car's rear and the closed line: leaves the painted number clear of its nose. */
const CAR_REAR_GAP = 0.1;

/** Shapes are drawn in plan XY and extruded along +Z; this tips them so +Z becomes world +Y and plan y becomes -z. */
const PLAN_TO_WORLD = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** Deterministic pseudo-random in [0,1) — the model must look identical every mount. */
const hash01 = (n: number): number => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

/* ------------------------------------------------------------------ */
/*  Plan-geometry helpers                                              */
/* ------------------------------------------------------------------ */

/** Drop repeated consecutive points and a closing duplicate of the first point. */
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

function ringCentroid(ring: Ring): Pt {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  const n = Math.max(1, ring.length);
  return [x / n, y / n];
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

/** Signed shoelace area: positive for a counter-clockwise ring. */
function ringSignedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

function ringPerimeter(ring: Ring): number {
  let p = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) p += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
  return p;
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

/** Mitred parallel offset of a ring: `d` > 0 grows it outward whatever its winding. Good for the near-rectangular rings the sheets carry. */
function offsetRing(ring: Ring, d: number): Ring {
  const r = cleanRing(ring);
  const n = r.length;
  if (n < 3) return r;
  const sign = ringSignedArea(r) > 0 ? 1 : -1; // outward normal of a CCW edge is to its right
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const p = r[i];
    const a = r[(i + n - 1) % n];
    const b = r[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const l2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const n1x = ((p[1] - a[1]) / l1) * sign;
    const n1y = (-(p[0] - a[0]) / l1) * sign;
    const n2x = ((b[1] - p[1]) / l2) * sign;
    const n2y = (-(b[0] - p[0]) / l2) * sign;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cosHalf = Math.max(0.35, mx * n1x + my * n1y); // clamp sharp mitres
    out.push([p[0] + (mx * d) / cosHalf, p[1] + (my * d) / cosHalf]);
  }
  return out;
}

/** A point `t` metres along the ring's perimeter, walking edge by edge from the first vertex. */
function pointAlongRing(ring: Ring, t: number): Pt {
  const n = ring.length;
  let rem = t;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rem <= len || i === n - 1) {
      const k = len > 0 ? Math.min(1, rem / len) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    rem -= len;
  }
  return ring[0];
}

/** The ring's longest edge as a segment frame. */
function longestEdge(ring: Ring): SegFrame | null {
  let best: SegFrame | null = null;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = segFrame([ring[j][0], ring[j][1], ring[i][0], ring[i][1]]);
    if (f && (!best || f.len > best.len)) best = f;
  }
  return best;
}

/** Principal (major) axis of a ring's vertices, as a unit direction; the covariance's leading eigenvector. */
function principalAxis(ring: Ring): { ux: number; uy: number } {
  const [cx, cy] = ringCentroid(ring);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of ring) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { ux: Math.cos(angle), uy: Math.sin(angle) };
}

/** Sorted crossings of the ring with the line x = u (in whatever 2D frame the ring is expressed). */
function ringCrossings(ring: Ring, u: number, out: number[]): number[] {
  out.length = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (xi > u !== xj > u) out.push(yi + ((u - xi) * (yj - yi)) / (xj - xi));
  }
  out.sort((a, b) => a - b);
  return out;
}

function shapeFrom(ring: Ring, holes?: Ring[]): THREE.Shape | null {
  const r = cleanRing(ring);
  if (r.length < 3) return null;
  const shape = new THREE.Shape(r.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes ?? []) {
    const hc = cleanRing(h);
    if (hc.length < 3) continue;
    shape.holes.push(new THREE.Path(hc.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return shape;
}

/** Extrude a plan shape upward by `height` into world orientation, resting on `y0`. */
function extrudePlan(shape: THREE.Shape, height: number, y0 = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  g.applyMatrix4(PLAN_TO_WORLD);
  if (y0 !== 0) g.translate(0, y0, 0);
  return g;
}

type SegFrame = { cx: number; cy: number; len: number; angle: number; ux: number; uy: number };

function segFrame(seg: Seg): SegFrame | null {
  const [x1, y1, x2, y2] = seg;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.02)) return null;
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, len, angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len };
}

/** A plan rectangle of thickness `t` centred on the segment. */
function segRectShape(seg: Seg, t: number): THREE.Shape | null {
  const f = segFrame(seg);
  if (!f) return null;
  const nx = (-f.uy * t) / 2;
  const ny = (f.ux * t) / 2;
  const [x1, y1, x2, y2] = seg;
  return new THREE.Shape([
    new THREE.Vector2(x1 + nx, y1 + ny),
    new THREE.Vector2(x2 + nx, y2 + ny),
    new THREE.Vector2(x2 - nx, y2 - ny),
    new THREE.Vector2(x1 - nx, y1 - ny),
  ]);
}

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** World matrix placing a local frame at plan (x, y), lifted to `yUp`, with local +x along plan angle `angle` (CCW). */
function frameAt(x: number, y: number, yUp: number, angle: number): THREE.Matrix4 {
  // A CCW plan rotation is a +Y world rotation once plan y maps to -z.
  return new THREE.Matrix4().makeTranslation(x, yUp, -y).multiply(_m1.makeRotationY(angle));
}

/** `base` followed by a local offset. Returns a fresh matrix. */
function offset(base: THREE.Matrix4, lx: number, ly: number, lz: number): THREE.Matrix4 {
  return base.clone().multiply(_m2.makeTranslation(lx, ly, lz));
}

/** `base` followed by a local offset and a local yaw about +Y. Returns a fresh matrix. */
function offsetRot(base: THREE.Matrix4, lx: number, ly: number, lz: number, yaw: number): THREE.Matrix4 {
  return base.clone().multiply(_m2.makeTranslation(lx, ly, lz)).multiply(_m1.makeRotationY(yaw));
}

/** A flat rectangle `len` × `wid` lying in the plan (facing up), centred on the local origin with `len` along local +x. */
function flatRect(len: number, wid: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, wid);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Scale a unit-UV geometry so its texture repeats in metres. */
function metreUV(g: THREE.BufferGeometry, sx: number, sy: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

/** A flat plan-shape mesh (floor patch, water surface…) lifted to `y`. */
function planPatch(shape: THREE.Shape, y: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 4);
  g.applyMatrix4(PLAN_TO_WORLD);
  g.translate(0, y, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Geometry merging                                                    */
/* ------------------------------------------------------------------ */

/**
 * Collects transformed geometries so a whole class of objects (every wall, every
 * walnut piece…) becomes one draw call. Sources are disposed on merge.
 */
class Bucket {
  geoms: THREE.BufferGeometry[] = [];

  add(geom: THREE.BufferGeometry, matrix: THREE.Matrix4 | null = null): void {
    // ExtrudeGeometry is non-indexed while Box/Sphere/Cylinder are indexed; merging needs one flavour.
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (g !== geom) geom.dispose();
    if (matrix) g.applyMatrix4(matrix);
    this.geoms.push(g);
  }

  /** Merge into one geometry. With `keepGroups`, each source's own material groups are carried over. */
  merge(keepGroups = false): THREE.BufferGeometry | null {
    if (this.geoms.length === 0) return null;
    const merged = mergeGeometries(this.geoms, false);
    if (merged && keepGroups) {
      merged.clearGroups();
      let start = 0;
      for (const g of this.geoms) {
        const count = g.attributes.position.count;
        if (g.groups.length === 0) merged.addGroup(start, count, 0);
        for (const grp of g.groups) {
          const c = Number.isFinite(grp.count) ? grp.count : count - grp.start;
          merged.addGroup(start + grp.start, c, grp.materialIndex ?? 0);
        }
        start += count;
      }
    }
    for (const g of this.geoms) g.dispose();
    this.geoms = [];
    return merged;
  }
}

function lineGeometry(verts: number[]): THREE.BufferGeometry | null {
  if (verts.length < 6) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Procedural textures                                                */
/* ------------------------------------------------------------------ */

/** One square metre of warm light-oak planks; UVs are in metres so it repeats 1:1. */
function makeFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d9c4a0';
    ctx.fillRect(0, 0, S, S);
    const ROWS = 7; // ~143 mm boards
    const rowH = S / ROWS;
    let seed = 0.37;
    const rnd = (): number => hash01((seed += 1.618) * 7.31);
    for (let r = 0; r < ROWS; r++) {
      const y0 = r * rowH;
      const l = 0.93 + rnd() * 0.11; // each board a touch lighter or darker
      ctx.fillStyle = `rgb(${Math.round(217 * l)}, ${Math.round(196 * l)}, ${Math.round(160 * l)})`;
      ctx.fillRect(0, y0, S, rowH);
      // grain — long, faintly wavy strokes along the board
      for (let i = 0; i < 28; i++) {
        const gy = y0 + 2 + rnd() * (rowH - 4);
        ctx.strokeStyle = `rgba(110, 78, 40, ${(0.04 + rnd() * 0.09).toFixed(3)})`;
        ctx.lineWidth = 0.6 + rnd() * 1.3;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(
          S * 0.3, gy + (rnd() - 0.5) * 5,
          S * 0.65, gy + (rnd() - 0.5) * 5,
          S, gy + (rnd() - 0.5) * 2,
        );
        ctx.stroke();
      }
      // a couple of darker knots/streaks
      for (let i = 0; i < 2; i++) {
        const gy = y0 + 4 + rnd() * (rowH - 8);
        const gx = rnd() * S;
        ctx.strokeStyle = 'rgba(96, 66, 32, 0.16)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + 60 + rnd() * 120, gy + (rnd() - 0.5) * 3);
        ctx.stroke();
      }
      // staggered end joint, then the board's bottom edge
      const jx = Math.floor(rnd() * S);
      ctx.fillStyle = 'rgba(96, 68, 36, 0.5)';
      ctx.fillRect(jx, y0, 2, rowH);
      ctx.fillStyle = 'rgba(96, 68, 36, 0.38)';
      ctx.fillRect(0, y0 + rowH - 1.5, S, 1.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type GridSpec = {
  /** Edge length of the canvas in metres — the texture repeats every this many metres. */
  metres: number;
  /** Tile / slab module in metres (must divide `metres`). */
  module: number;
  /** Base tile colour as RGB 0–255. */
  base: [number, number, number];
  /** Joint / grout colour. */
  joint: string;
  jointPx: number;
  /** Per-tile luminance jitter (0.04 = ±2 %). */
  variance: number;
  /** Fine dark/light flecks per tile (porcelain). */
  speckle?: number;
  /** Soft cloudy blotches per tile (limestone). */
  mottle?: number;
};

/** A square of grouted tiles/slabs with UVs in metres, so the grid runs continuously across rooms. */
function makeGridTexture(spec: GridSpec, seed0: number): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const n = Math.max(1, Math.round(spec.metres / spec.module));
    const cell = S / n;
    const g = spec.jointPx;
    let seed = seed0;
    const rnd = (): number => hash01((seed += 1.618) * 7.31);
    ctx.fillStyle = spec.joint;
    ctx.fillRect(0, 0, S, S);
    const [br, bg, bb] = spec.base;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x0 = i * cell + g / 2;
        const y0 = j * cell + g / 2;
        const w = cell - g;
        const l = 1 - spec.variance / 2 + rnd() * spec.variance;
        ctx.fillStyle = `rgb(${Math.round(br * l)}, ${Math.round(bg * l)}, ${Math.round(bb * l)})`;
        ctx.fillRect(x0, y0, w, w);
        for (let k = 0; k < (spec.mottle ?? 0); k++) {
          const cx = x0 + rnd() * w;
          const cy = y0 + rnd() * w;
          const r = w * (0.18 + rnd() * 0.3);
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          const dark = rnd() < 0.5;
          grad.addColorStop(0, dark ? 'rgba(120, 104, 74, 0.09)' : 'rgba(255, 252, 240, 0.12)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x0, y0, w, w);
        }
        for (let k = 0; k < (spec.speckle ?? 0); k++) {
          const px = x0 + rnd() * w;
          const py = y0 + rnd() * w;
          ctx.fillStyle = rnd() < 0.6 ? 'rgba(70, 62, 50, 0.08)' : 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(px, py, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / spec.metres, 1 / spec.metres);
  return tex;
}

/** Large warm-grey porcelain tiles on a 0.6 m module with thin grout lines. */
const makeTileTexture = (): THREE.CanvasTexture =>
  makeGridTexture(
    { metres: 1.2, module: 0.6, base: [215, 210, 200], joint: '#b9b3a6', jointPx: 3, variance: 0.05, speckle: 90 },
    0.53,
  );

/** Honed cream limestone slabs with faint 1.2 m joints. */
const makeStoneTexture = (): THREE.CanvasTexture =>
  makeGridTexture(
    { metres: 2.4, module: 1.2, base: [226, 217, 196], joint: '#cfc5ad', jointPx: 2, variance: 0.04, mottle: 7 },
    0.71,
  );

/** Pale terrace pavers on a 0.5 m module, a shade darker than the interior finishes. */
const makePaverTexture = (): THREE.CanvasTexture =>
  makeGridTexture(
    { metres: 1, module: 0.5, base: [192, 184, 166], joint: '#9f9682', jointPx: 3, variance: 0.08, speckle: 40 },
    0.29,
  );

/** Pale pool mosaic: 50 mm glass tiles with light grout, repeating every half metre. */
const makeMosaicTexture = (): THREE.CanvasTexture =>
  makeGridTexture(
    { metres: 0.5, module: 0.05, base: [143, 184, 196], joint: '#dfe8ec', jointPx: 3, variance: 0.14 },
    0.83,
  );

type SpeckleSpec = {
  /** Edge length of the canvas in metres. */
  metres: number;
  base: [number, number, number];
  /** Fine flecks: count and luminance swing (0.12 = ±12 %). */
  specks: number;
  speckSwing: number;
  /** Soft cloudy blobs: count, radius range in px and alpha. */
  blobs?: number;
  blobR?: [number, number];
  blobAlpha?: number;
  /** Short grass-like strokes for lawns. */
  strokes?: number;
};

/** Flat-toned surfaces with fine noise — sealed concrete, asphalt aggregate, clumpy lawn. UVs in metres. */
function makeSpeckleTexture(spec: SpeckleSpec, seed0: number): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let seed = seed0;
    const rnd = (): number => hash01((seed += 1.618) * 7.31);
    const [br, bg, bb] = spec.base;
    ctx.fillStyle = `rgb(${br}, ${bg}, ${bb})`;
    ctx.fillRect(0, 0, S, S);
    const [r0, r1] = spec.blobR ?? [12, 40];
    for (let k = 0; k < (spec.blobs ?? 0); k++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      const r = r0 + rnd() * (r1 - r0);
      const dark = rnd() < 0.55;
      const a = spec.blobAlpha ?? 0.1;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, dark ? `rgba(0, 0, 0, ${a})` : `rgba(255, 255, 255, ${a * 0.8})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      // draw wrapped copies so the tile stays seamless
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) ctx.fillRect(cx - r + ox, cy - r + oy, r * 2, r * 2);
    }
    for (let k = 0; k < spec.specks; k++) {
      const l = 1 - spec.speckSwing + rnd() * spec.speckSwing * 2;
      ctx.fillStyle = `rgba(${Math.round(br * l)}, ${Math.round(bg * l)}, ${Math.round(bb * l)}, ${(0.5 + rnd() * 0.5).toFixed(2)})`;
      ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    for (let k = 0; k < (spec.strokes ?? 0); k++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const l = 0.82 + rnd() * 0.36;
      ctx.strokeStyle = `rgba(${Math.round(br * l)}, ${Math.round(bg * l)}, ${Math.round(bb * l)}, 0.6)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 6, y - 3 - rnd() * 6);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / spec.metres, 1 / spec.metres);
  return tex;
}

/** Sealed basement concrete: mid warm grey with fine trowel noise and faint cloudiness. */
const makeConcreteTexture = (): THREE.CanvasTexture =>
  makeSpeckleTexture(
    { metres: 2, base: [143, 141, 134], specks: 7000, speckSwing: 0.07, blobs: 40, blobR: [30, 90], blobAlpha: 0.05 },
    0.41,
  );

/** Asphalt: near-black with light aggregate flecks. */
const makeAsphaltTexture = (): THREE.CanvasTexture =>
  makeSpeckleTexture(
    { metres: 2, base: [44, 46, 44], specks: 11000, speckSwing: 0.35, blobs: 24, blobR: [40, 110], blobAlpha: 0.06 },
    0.67,
  );

/** Lawn: clumpy greens with short grass strokes. */
const makeLawnTexture = (): THREE.CanvasTexture =>
  makeSpeckleTexture(
    { metres: 3, base: [92, 122, 66], specks: 5000, speckSwing: 0.18, blobs: 260, blobR: [8, 28], blobAlpha: 0.14, strokes: 4000 },
    0.19,
  );

/** Tileable normal map of layered sine ripples; scrolled in the frame loop so the water shimmers. */
function makeWaterNormalTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(S, S);
    const TAU = Math.PI * 2;
    // integer wave numbers keep every ripple periodic over the canvas
    const waves: Array<[number, number, number, number]> = [
      [3, 1, 1.0, 0.3],
      [-2, 4, 0.7, 1.9],
      [5, -3, 0.45, 4.1],
      [1, 7, 0.35, 2.6],
      [8, 2, 0.25, 0.8],
      [-6, -6, 0.2, 5.2],
    ];
    const height = (x: number, y: number): number => {
      let h = 0;
      for (const [kx, ky, a, ph] of waves) h += a * Math.sin(((kx * x + ky * y) / S) * TAU + ph);
      return h;
    };
    const STRENGTH = 3.5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (height(x + 1, y) - height(x - 1, y)) * STRENGTH;
        const dy = (height(x, y + 1) - height(x, y - 1)) * STRENGTH;
        const inv = 1 / Math.hypot(dx, dy, 1);
        const o = (y * S + x) * 4;
        img.data[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
        img.data[o + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
        img.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5); // one canvas per 2 m of water
  return tex;
}

/**
 * A bay's painted label as a transparent texture: condensed uppercase in off-white at 85 % on nothing.
 * Aspect matches the BAY_PAINT_W × BAY_PAINT_H plane it is mapped onto.
 */
function makeBayTextTexture(text: string, maxAnisotropy: number): THREE.CanvasTexture {
  const W = 512;
  const H = Math.round((W * BAY_PAINT_H) / BAY_PAINT_W);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const label = text.toUpperCase();
    // squeeze the glyphs whatever face the platform resolves, so the paint reads condensed everywhere
    const squeeze = 0.8;
    const family = 'condensed 700 100px "Inter", "Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    ctx.font = family;
    const natural = ctx.measureText(label).width * squeeze;
    const maxW = W * 0.9;
    const size = Math.min(H * 0.74, (100 * maxW) / Math.max(1, natural));
    ctx.font = family.replace('100px', `${size.toFixed(1)}px`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(232, 230, 224, 0.85)';
    ctx.setTransform(squeeze, 0, 0, 1, W / 2, H / 2 + size * 0.04);
    ctx.fillText(label, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Painted-text materials keyed by label text, shared across level rebuilds and disposed with the viewer. */
class BayTextCache {
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly maxAnisotropy: number;

  constructor(maxAnisotropy: number) {
    this.maxAnisotropy = maxAnisotropy;
  }

  get(text: string): THREE.MeshStandardMaterial {
    let m = this.mats.get(text);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: makeBayTextTexture(text, this.maxAnisotropy),
        roughness: 0.7,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      this.mats.set(text, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.mats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.mats.clear();
  }
}

/** Where a label sits in the declutter order; ties go to the larger room. */
function labelPriority(name: string): number {
  if (SERVICE_ROOM.test(name)) return PRIORITY_SERVICE;
  if (KEY_LABEL.test(name)) return PRIORITY_KEY;
  if (PRINCIPAL_ROOM.test(name)) return PRIORITY_PRINCIPAL;
  return PRIORITY_ROOM;
}

/** Radial alpha falloff for the soft ground disc. */
function makeRadialAlpha(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return new THREE.CanvasTexture(canvas);
}

/* ------------------------------------------------------------------ */
/*  Materials (shared across level rebuilds)                           */
/* ------------------------------------------------------------------ */

type Mats = ReturnType<typeof createMaterials>;

function createMaterials(maxAnisotropy: number) {
  const floorTex = makeFloorTexture();
  const tileTex = makeTileTexture();
  const stoneTex = makeStoneTexture();
  const paverTex = makePaverTexture();
  const concreteTex = makeConcreteTexture();
  const asphaltTex = makeAsphaltTexture();
  const lawnTex = makeLawnTexture();
  const mosaicTex = makeMosaicTexture();
  const waterNormal = makeWaterNormalTexture();
  for (const t of [floorTex, tileTex, stoneTex, paverTex, concreteTex, asphaltTex, lawnTex, mosaicTex]) t.anisotropy = maxAnisotropy;
  const std = (color: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  // Room floor patches lie a hair above the slab: polygon offset keeps them from z-fighting at distance.
  const patch = (map: THREE.Texture, roughness: number, factor = -1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ map, roughness, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor, ...extra });
  // Painted floor markings sit above the patches; a stronger offset keeps them crisp at any distance.
  const paint = (color: number, opacity: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
  const glow = (opacity: number) =>
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  return {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }),
    floorOak: patch(floorTex, 0.55),
    floorTile: patch(tileTex, 0.35),
    floorStone: patch(stoneTex, 0.5),
    floorOutdoor: patch(paverTex, 0.92),
    hover: glow(0.18),
    select: glow(0.22),
    hoverEdge: new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.75, toneMapped: false }),
    selectEdge: new THREE.LineBasicMaterial({ color: GOLD, toneMapped: false }),
    stone: std(0xd8c9a3, 0.9), // slab edge, sills, treads
    wall: std(0xefe8da, 0.9),
    wallCap: std(0xe2d8c3, 0.9),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x8fb3c4,
      transmission: 0.6,
      roughness: 0.15,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
    frame: std(0x3a4448, 0.6, { metalness: 0.3 }),
    walnut: std(0x6b4a2e, 0.6),
    arc: new THREE.LineBasicMaterial({ color: 0x8f7647, transparent: true, opacity: 0.5 }),
    edge: new THREE.LineBasicMaterial({ color: 0x8a8272, transparent: true, opacity: 0.55 }),
    linen: std(0xe8e2d6, 0.95),
    throw: std(0x8f7647, 0.9),
    pillow: std(0xf4f1ea, 0.95),
    fabric: std(0x5b6b5e, 0.95),
    chair: std(0x3c3a36, 0.7),
    counter: std(0xefe8da, 0.8),
    darkStone: std(0x2a2b25, 0.35),
    closet: std(0xe3dccd, 0.75),
    ceramic: std(0xf4f1ea, 0.3),
    ceramicInset: std(0xd6d2c6, 0.25),
    metal: std(0xb8b8b3, 0.35, { metalness: 0.6 }),
    oven: std(0x3a3a3a, 0.5, { metalness: 0.2 }),
    trunk: std(0x4a3b2c, 1),
    leaf: std(0x6b7d5a, 1),
    leafDark: std(0x56704a, 1),
    generic: std(0xcfc7b4, 0.85), // also the planter-box stone
    ground: new THREE.MeshStandardMaterial({
      color: 0x16201a,
      roughness: 1,
      transparent: true,
      alphaMap: makeRadialAlpha(),
    }),
    /* --- car park --- */
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.85 }),
    asphalt: patch(asphaltTex, 0.95, -2, { metalness: 0.05 }),
    bayLine: paint(0xd8d6cf, 0.9),
    chevron: paint(0xc9c4b8, 0.6),
    curb: std(0xa9a59b, 0.9),
    column: std(0xb8b4aa, 0.9),
    columnCap: std(0xa39f95, 0.9),
    carBody: std(0xffffff, 0.35, { metalness: 0.4 }), // tinted per instance
    carGlass: new THREE.MeshPhysicalMaterial({
      color: 0x1e262b,
      transmission: 0.3,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
    }),
    wheel: std(0x1c1d1e, 0.85),
    /* --- water --- */
    poolTile: new THREE.MeshStandardMaterial({
      map: mosaicTex,
      roughness: 0.3,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    coping: std(0xe2d9c4, 0.8),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x3f9cbd,
      transmission: 0.7,
      roughness: 0.05,
      thickness: 1.2,
      ior: 1.33,
      transparent: true,
      opacity: 0.92,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    skyGlass: new THREE.MeshPhysicalMaterial({
      color: 0xbcd3dd,
      transmission: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
    bronze: std(0x6b5a3e, 0.45, { metalness: 0.55 }),
    /* --- planting --- */
    lawn: patch(lawnTex, 1, -2),
    terrace: patch(paverTex, 0.92, -2), // zone patch above a room's own outdoor patch
    hedge: std(0x3e5a34, 1),
    /* --- illustrative staging: a lighter, calmer palette than the drawn fixtures, so it never passes for survey --- */
    stLinen: std(0xece7dc, 0.95),
    stWalnut: std(0x7a5a3c, 0.65),
    stFabric: std(0x9aa39a, 0.95),
    stMetal: std(0x3a3d40, 0.45, { metalness: 0.35 }),
    stRug: std(0xcbbfae, 1),
    stRugEdge: std(0xb7aa96, 1, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    stScreen: std(0x1e2226, 0.3, { metalness: 0.2 }),
    stLeaf: std(0x8fa085, 1),
  };
}

function disposeMaterials(mats: Mats): void {
  for (const m of Object.values(mats)) {
    const mm = m as THREE.Material & {
      map?: THREE.Texture | null;
      alphaMap?: THREE.Texture | null;
      normalMap?: THREE.Texture | null;
    };
    // textures shared between materials are disposed once; a second dispose() is a no-op
    mm.map?.dispose();
    mm.alphaMap?.dispose();
    mm.normalMap?.dispose();
    mm.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Level builder                                                       */
/* ------------------------------------------------------------------ */

type RoomNode = {
  index: number;
  apartment: string | null;
  /** Gold highlight mesh over the room's floor patch; null when the room has no ring. */
  overlay: THREE.Mesh | null;
  /** Hairline gold outline of the ring, shown with the overlay so a lit room reads on a warm floor. */
  outline: THREE.LineLoop | null;
  /** The CSS2D label pill; null for unnamed rooms. */
  label: HTMLElement | null;
};

type BayNode = {
  index: number;
  /** Registered residence code the bay's label tags; null for shared / unlabelled bays. */
  code: string | null;
  /** Gold highlight over the bay; also the pick target (raycasting ignores visibility). */
  overlay: THREE.Mesh;
  outline: THREE.LineLoop | null;
  /** The hover pill, shown only while the bay is lit. */
  label: CSS2DObject;
};

/** One CSS2D label in the screen-space declutter: room pills, landmark pills, apartment pins, bay pills. */
type LabelEntry = {
  el: HTMLElement;
  obj: CSS2DObject;
  priority: number;
  /** Plan area in m² — the tie-break within a priority: bigger rooms name themselves first. */
  area: number;
  /** World-space corners of the room ring's bbox for the fit-in-room rule; null without a ring. */
  corners: THREE.Vector3[] | null;
  /** Tiers away below LABEL_MINOR_MIN_PX_PER_M (`is-minor`). */
  minor: boolean;
  /** Never tiers away (`is-pinned`): the pool, a lit bay. */
  pinned: boolean;
  /** An apartment pin on a parking level: shown only while lit. */
  parkingPin: boolean;
  /** Measured pill size in CSS px, read once per build after the element is in the DOM. */
  w: number;
  h: number;
  /** Last applied state, so class toggles only touch the DOM on change. */
  occluded: boolean;
  toobig: boolean;
  /** Screen-space row offset (px) a landmark stepped by to clear an equal — applied as margin-top. */
  nudge: number;
};

type Level = {
  group: THREE.Group;
  /** Plan centre on the slab, in world space. */
  center: THREE.Vector3;
  diag: number;
  width: number;
  depth: number;
  rooms: RoomNode[];
  bays: BayNode[];
  /** Every CSS2D label, pre-sorted by priority then area for the declutter pass. */
  labels: LabelEntry[];
  /** Floor patches and bay overlays the pointer can hover; `userData.room` / `userData.bay` index the node lists. */
  pickables: THREE.Mesh[];
  /** Apartment pins by code. */
  pins: Map<string, HTMLElement>;
  /** World-space bounds of each apartment's rooms, for camera framing. */
  aptBounds: Map<string, THREE.Box3>;
  /** The illustrative staging, toggled as one. */
  staging: THREE.Group;
};

/** Callbacks the level's DOM pins report into. */
type LevelUi = {
  onPinClick: (code: string) => void;
  onPinHover: (code: string | null) => void;
};

const FLOOR_MAT: Record<NonNullable<Plan3D['rooms'][number]['floor']>, keyof Mats> = {
  oak: 'floorOak',
  tile: 'floorTile',
  stone: 'floorStone',
  outdoor: 'floorOutdoor',
};

function stairTreads(segs: Seg[]): Array<{ f: SegFrame; y: number }> {
  const frames = segs.map(segFrame).filter((f): f is SegFrame => f !== null);
  const n = frames.length;
  // Cluster treads into runs: parallel and close together.
  const parent = frames.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = frames[i];
      const b = frames[j];
      const dot = Math.abs(a.ux * b.ux + a.uy * b.uy);
      if (dot > 0.94 && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 0.6) parent[find(i)] = find(j);
    }
  }
  const runs = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = runs.get(r);
    if (list) list.push(i);
    else runs.set(r, [i]);
  }
  const out: Array<{ f: SegFrame; y: number }> = [];
  for (const idx of runs.values()) {
    if (idx.length < 3) {
      for (const i of idx) out.push({ f: frames[i], y: 0.02 }); // flat when unsure
      continue;
    }
    const first = frames[idx[0]];
    const nx = -first.uy; // run direction — across the treads
    const ny = first.ux;
    idx.sort((a, b) => frames[a].cx * nx + frames[a].cy * ny - (frames[b].cx * nx + frames[b].cy * ny));
    const riser = Math.min(0.17, (WALL_H - 0.3) / (idx.length - 1));
    idx.forEach((i, k) => out.push({ f: frames[i], y: 0.02 + k * riser }));
  }
  return out;
}

/** Everything the zone builders need from the level under construction. */
type BuildCtx = {
  plan: Plan3D;
  mats: Mats;
  group: THREE.Group;
  bucket: (m: THREE.Material) => Bucket;
  box: BoxFn;
  rbox: BoxFn;
  parking: boolean;
  wallH: number;
  /** Plan centre in plan coordinates. */
  planCenter: Pt;
  /** Painted bay-number materials, one per unique label text. */
  bayText: BayTextCache;
  /** Flat painted materials that must not cast shadows. */
  noShadow: Set<THREE.Material>;
  /** Labels registered for the declutter as the zones and bays build. */
  labels: LabelEntry[];
};

/** World-space corners of a ring's plan bbox on the slab, for projecting a room's on-screen extent. */
function ringCorners(ring: Ring): THREE.Vector3[] {
  const [x0, y0, x1, y1] = ringBBox(ring);
  return [new THREE.Vector3(x0, 0, -y0), new THREE.Vector3(x1, 0, -y0), new THREE.Vector3(x1, 0, -y1), new THREE.Vector3(x0, 0, -y1)];
}

function makeLabelEntry(
  el: HTMLElement,
  obj: CSS2DObject,
  priority: number,
  ring: Ring | null,
  flags: { minor?: boolean; pinned?: boolean; parkingPin?: boolean; fit?: boolean } = {},
): LabelEntry {
  const r = ring ? cleanRing(ring) : null;
  const closed = r !== null && r.length >= 3;
  return {
    el,
    obj,
    priority,
    area: closed ? Math.abs(ringSignedArea(r)) : 0,
    // landmarks (fit: false) keep their area for the tie-break but never hide for outgrowing the ring
    corners: closed && flags.fit !== false ? ringCorners(r) : null,
    minor: flags.minor ?? false,
    pinned: flags.pinned ?? false,
    parkingPin: flags.parkingPin ?? false,
    w: 0,
    h: 0,
    occluded: false,
    toobig: false,
    nudge: 0,
  };
}

function buildLevel(plan: Plan3D, mats: Mats, ui: LevelUi, parking: boolean, showStaging: boolean, bayText: BayTextCache): Level {
  const group = new THREE.Group();
  const [bx0, by0, bx1, by1] = plan.bbox;
  const width = Math.max(1, bx1 - bx0);
  const depth = Math.max(1, by1 - by0);
  const diag = Math.hypot(width, depth);
  const center = new THREE.Vector3((bx0 + bx1) / 2, 0, -(by0 + by1) / 2);
  const wallH = parking ? PARKING_WALL_H : WALL_H;
  const zones = plan.zones ?? [];
  const waterRings = zones.filter((z) => z.kind === 'water').map((z) => cleanRing(z.ring)).filter((r) => r.length >= 3);

  const buckets = new Map<THREE.Material, Bucket>();
  const bucket = (m: THREE.Material): Bucket => {
    let b = buckets.get(m);
    if (!b) {
      b = new Bucket();
      buckets.set(m, b);
    }
    return b;
  };
  // a skylight that shadowed the pool would defeat itself; painted markings are flat
  const noShadow = new Set<THREE.Material>([mats.glass, mats.ceramicInset, mats.skyGlass, mats.bayLine, mats.chevron]);
  const arcVerts: number[] = [];
  const edgeVerts: number[] = [];
  const labels: LabelEntry[] = [];

  const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);
  const rbox = (w: number, h: number, d: number): THREE.BufferGeometry => {
    const r = Math.min(0.04, Math.min(w, h, d) * 0.45);
    return new RoundedBoxGeometry(w, h, d, 2, r);
  };

  /* ---------- slab ---------- */
  const slab = new Bucket();
  for (const ring of plan.footprint) {
    // shafts and pool basins are cut out of the plate
    const holes = [...plan.shafts, ...waterRings].filter((s) => {
      const c = ringCentroid(s);
      return pointInRing(c[0], c[1], ring);
    });
    const shape = shapeFrom(ring, holes);
    if (shape) slab.add(extrudePlan(shape, SLAB_T, -SLAB_T));
  }
  const slabGeom = slab.merge(true);
  if (slabGeom) {
    // basements get sealed concrete for a top; residential plates keep the oak
    const m = new THREE.Mesh(slabGeom, [parking ? mats.concrete : mats.floor, mats.stone]);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* ---------- walls ---------- */
  const walls = new Bucket();
  for (const wp of plan.wallPolys) {
    const shape = shapeFrom(wp.ring, wp.holes);
    if (shape) walls.add(extrudePlan(shape, wallH));
  }
  for (const seg of plan.wallLines) {
    const shape = segRectShape(seg, LINE_WALL_T);
    if (shape) walls.add(extrudePlan(shape, wallH));
  }
  const wallGeom = walls.merge(true);
  if (wallGeom) {
    // caps (group 0) get the darker cream so wall tops read from above; sides (group 1) are plaster
    const m = new THREE.Mesh(wallGeom, [mats.wallCap, mats.wall]);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* ---------- windows ---------- */
  for (const seg of plan.windows) {
    const f = segFrame(seg);
    if (!f || f.len < 0.15) continue;
    const at = (y: number, lx = 0): THREE.Matrix4 => offset(frameAt(f.cx, f.cy, y, f.angle), lx, 0, 0);
    const glassH = HEAD_H - SILL_H;
    const midY = (HEAD_H + SILL_H) / 2;
    bucket(mats.glass).add(box(f.len - 0.08, glassH, 0.06), at(midY));
    // bronze frame: head, sill rail, jambs, mullions
    bucket(mats.frame).add(box(f.len, 0.06, 0.1), at(HEAD_H));
    bucket(mats.frame).add(box(f.len, 0.06, 0.1), at(SILL_H));
    bucket(mats.frame).add(box(0.06, glassH + 0.06, 0.1), at(midY, -f.len / 2 + 0.03));
    bucket(mats.frame).add(box(0.06, glassH + 0.06, 0.1), at(midY, f.len / 2 - 0.03));
    const mullions = Math.floor(f.len / 1.1);
    for (let k = 1; k <= mullions; k++) {
      bucket(mats.frame).add(box(0.04, glassH, 0.08), at(midY, -f.len / 2 + (k * f.len) / (mullions + 1)));
    }
    // stone sill, plus plaster below the sill and above the head so the opening reads as cut into a wall
    bucket(mats.stone).add(box(f.len + 0.12, 0.05, 0.3), at(SILL_H - 0.055));
    bucket(mats.wall).add(box(f.len, SILL_H - 0.08, 0.2), at((SILL_H - 0.08) / 2));
    bucket(mats.wall).add(box(f.len, wallH - HEAD_H - 0.03, 0.2), at((wallH + HEAD_H + 0.03) / 2));
  }

  /* ---------- doors ---------- */
  for (const door of plan.doors) {
    const w = door.width;
    if (!(w > 0.2)) continue;
    const closed = door.rot * DEG;
    const open = closed + DOOR_OPEN;
    // leaf swung open about the hinge
    bucket(mats.walnut).add(box(w, DOOR_H, 0.05), offset(frameAt(door.x, door.y, 0, open), w / 2, DOOR_H / 2, 0));
    // lintel closing the top of the opening along the wall line
    bucket(mats.wall).add(
      box(w, wallH - DOOR_H, 0.16),
      offset(frameAt(door.x, door.y, 0, closed), w / 2, (wallH + DOOR_H) / 2, 0),
    );
    // swing arc on the floor
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a0 = closed + ((open - closed) * i) / steps;
      const a1 = closed + ((open - closed) * (i + 1)) / steps;
      arcVerts.push(
        door.x + w * Math.cos(a0), 0.015, -(door.y + w * Math.sin(a0)),
        door.x + w * Math.cos(a1), 0.015, -(door.y + w * Math.sin(a1)),
      );
    }
  }

  /* ---------- furniture ---------- */
  for (const item of plan.furniture) {
    const [x0, y0, x1, y1] = item.box;
    const w = x1 - x0;
    const d = y1 - y0;
    if (!(w > 0.03) || !(d > 0.03)) continue;
    const h = Math.max(0.05, item.height);
    const base = frameAt((x0 + x1) / 2, (y0 + y1) / 2, 0, (item.rot ?? 0) * DEG);
    // local frame: x along the box width, z along its depth (local +z = plan -y), y up
    const put = (mat: THREE.Material, geom: THREE.BufferGeometry, lx: number, ly: number, lz: number): void => {
      bucket(mat).add(geom, offset(base, lx, ly, lz));
    };
    const longX = w >= d;
    addFurniture(item.kind, w, d, h, longX, put, box, rbox, mats, base, edgeVerts);
  }

  /* ---------- stairs ---------- */
  for (const { f, y } of stairTreads(plan.stairs)) {
    bucket(mats.stone).add(box(f.len, 0.04, 0.28), frameAt(f.cx, f.cy, y + 0.02, f.angle));
  }

  /* ---------- trees ---------- */
  for (const t of plan.trees) {
    const r = Math.max(0.3, t.r);
    const base = frameAt(t.x, t.y, 0, 0);
    bucket(mats.trunk).add(new THREE.CylinderGeometry(r * 0.1, r * 0.14, r * 1.2, 8), offset(base, 0, r * 0.6, 0));
    bucket(mats.leaf).add(new THREE.SphereGeometry(r, 14, 10), offset(base, 0, r * 1.5, 0));
    bucket(mats.leafDark).add(new THREE.SphereGeometry(r * 0.72, 12, 8), offset(base, r * 0.5, r * 1.25, r * 0.3));
    bucket(mats.leaf).add(new THREE.SphereGeometry(r * 0.66, 12, 8), offset(base, -r * 0.45, r * 1.35, -r * 0.35));
  }

  /* ---------- zones, columns, bays + cars (all optional in the contract) ---------- */
  const ctx: BuildCtx = {
    plan,
    mats,
    group,
    bucket,
    box,
    rbox,
    parking,
    wallH,
    planCenter: [(bx0 + bx1) / 2, (by0 + by1) / 2],
    bayText,
    noShadow,
    labels,
  };
  for (const zone of zones) {
    const ring = cleanRing(zone.ring);
    if (ring.length < 3) continue;
    switch (zone.kind) {
      case 'parking':
        addParkingApron(ctx, ring);
        break;
      case 'ramp':
        addRamp(ctx, ring);
        break;
      case 'water':
        addWater(ctx, ring, zone.label);
        break;
      case 'garden':
        addGarden(ctx, ring);
        break;
      case 'terrace':
        addTerrace(ctx, ring);
        break;
      case 'plant':
        addPlanter(ctx, ring);
        break;
    }
  }
  addColumns(ctx);
  const bayNodes = addBays(ctx);

  /* ---------- illustrative staging: its own group so the page can toggle it ---------- */
  const staging = buildStaging(ctx, stagePlan(plan));
  staging.visible = showStaging;
  group.add(staging);

  /* ---------- merged meshes ---------- */
  for (const [mat, b] of buckets) {
    const g = b.merge();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !noShadow.has(mat);
    mesh.receiveShadow = true;
    if (mat === mats.glass || mat === mats.skyGlass) mesh.renderOrder = 2;
    group.add(mesh);
  }
  const arcGeom = lineGeometry(arcVerts);
  if (arcGeom) group.add(new THREE.LineSegments(arcGeom, mats.arc));
  const edgeGeom = lineGeometry(edgeVerts);
  if (edgeGeom) group.add(new THREE.LineSegments(edgeGeom, mats.edge));

  /* ---------- rooms: floor patches, highlight overlays, labels ---------- */
  const rooms: RoomNode[] = [];
  const pickables: THREE.Mesh[] = [];
  const aptBounds = new Map<string, THREE.Box3>();
  const growBounds = (code: string, x: number, y: number, pad: number): void => {
    let b = aptBounds.get(code);
    if (!b) {
      b = new THREE.Box3();
      aptBounds.set(code, b);
    }
    b.expandByPoint(_v.set(x - pad, 0, -y - pad));
    b.expandByPoint(_v.set(x + pad, wallH, -y + pad));
  };
  // a residence's bays belong to it: framing the residence frames them too
  for (const node of bayNodes) {
    if (!node.code) continue;
    const bay = (plan.bays ?? [])[node.index];
    if (bay) growBounds(node.code, (bay.box[0] + bay.box[2]) / 2, (bay.box[1] + bay.box[3]) / 2, 3);
  }
  plan.rooms.forEach((room, index) => {
    const apartment = room.apartment?.trim() || null;
    const node: RoomNode = { index, apartment, overlay: null, outline: null, label: null };
    rooms.push(node);

    // A room drawn over a pool basin gets no finish (the water is the floor) and the basin's own
    // pinned pill names it — the nomenclature label would only double up.
    const overWater = waterRings.some((w) => pointInRing(room.x, room.y, w));
    // Floor finish + hover/selection overlay from the enclosed ring, when the extractor found one.
    const shape = room.ring && room.floor && !overWater ? shapeFrom(room.ring) : null;
    if (shape) {
      const geom = new THREE.ShapeGeometry(shape, 4); // UVs are plan metres → finishes run across rooms
      geom.applyMatrix4(PLAN_TO_WORLD);
      const patch = new THREE.Mesh(geom, mats[FLOOR_MAT[room.floor ?? 'oak']]);
      patch.position.y = FLOOR_LIFT;
      patch.receiveShadow = true;
      patch.userData.room = index;
      group.add(patch);
      pickables.push(patch);
      const overlay = new THREE.Mesh(geom, mats.hover); // shares the geometry — disposed once with it
      overlay.position.y = HIGHLIGHT_LIFT;
      overlay.visible = false;
      overlay.renderOrder = 1;
      group.add(overlay);
      node.overlay = overlay;
      const edgeVerts: number[] = [];
      for (const [x, y] of cleanRing(room.ring ?? [])) edgeVerts.push(x, HIGHLIGHT_LIFT + 0.01, -y);
      const edgeGeom = lineGeometry(edgeVerts);
      if (edgeGeom) {
        const outline = new THREE.LineLoop(edgeGeom, mats.hoverEdge);
        outline.visible = false;
        outline.renderOrder = 1;
        group.add(outline);
        node.outline = outline;
      }
      if (apartment) for (const [x, y] of room.ring ?? []) growBounds(apartment, x, y, 0.4);
    } else if (apartment) {
      growBounds(apartment, room.x, room.y, 2.5);
    }

    const name = room.name.trim();
    if (!name || (overWater && /pool|water/i.test(name))) return;
    const el = document.createElement('div');
    const priority = labelPriority(name);
    const key = priority === PRIORITY_KEY;
    // Principal rooms label the floor at a glance; service spaces only once zoomed in.
    const minor = priority <= PRIORITY_SERVICE || MINOR_ROOM.test(name);
    el.className = 'fp3d-label';
    if (minor) el.classList.add('is-minor');
    // the floor's landmarks (pool, reception, car park) take the pins' gold hairline and, like a
    // lake's name on a map, never tier away or hide for outgrowing their room
    if (key) el.classList.add('is-key', 'is-pinned');
    el.textContent = name;
    // The measured net area rides in the pill from the build, so the declutter's one-time measure
    // already accounts for it (a hover-time widening would invalidate every measured rect).
    if (typeof room.area === 'number' && room.area > 0) {
      const area = document.createElement('span');
      area.className = 'fp3d-label-area';
      area.textContent = `· ${Math.round(room.area)} m²`;
      el.appendChild(area);
    }
    const obj = new CSS2DObject(el);
    obj.position.set(room.x, 0.02, -room.y);
    group.add(obj);
    node.label = el;
    labels.push(makeLabelEntry(el, obj, priority, room.ring ?? null, { minor, pinned: key, fit: !key }));
  });

  /* ---------- apartment pins ---------- */
  const pins = new Map<string, HTMLElement>();
  for (const apt of plan.apartments ?? []) {
    const code = apt.code.trim();
    if (!code || pins.has(code)) continue;
    const el = document.createElement('div');
    // basement sheets tag bays and stores with residence codes: the painted bay numbers are the
    // everyday label there, so the pins stay hidden unless lit from the level card
    el.className = parking ? 'fp3d-apt is-parking' : 'fp3d-apt';
    el.dataset.code = code;
    el.textContent = code;
    el.addEventListener('click', () => ui.onPinClick(code));
    el.addEventListener('pointerenter', () => ui.onPinHover(code));
    el.addEventListener('pointerleave', () => ui.onPinHover(null));
    const obj = new CSS2DObject(el);
    obj.position.set(apt.x, PIN_H, -apt.y);
    group.add(obj);
    pins.set(code, el);
    labels.push(makeLabelEntry(el, obj, PRIORITY_PIN, null, { parkingPin: parking }));
    // an apartment whose rooms never closed still frames around its tag
    if (!aptBounds.has(code)) growBounds(code, apt.x, apt.y, 4);
  }

  // Declutter order: priority, then the larger room. Lit labels are pulled ahead per pass.
  labels.sort((a, b) => b.priority - a.priority || b.area - a.area);

  /* ---------- ground disc ---------- */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(diag * 1.6, 72), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -1.1, center.z);
  ground.receiveShadow = true;
  group.add(ground);

  for (const node of bayNodes) {
    node.overlay.userData.bay = node.index;
    pickables.push(node.overlay);
  }

  return { group, center, diag, width, depth, rooms, bays: bayNodes, labels, pickables, pins, aptBounds, staging };
}

/* ------------------------------------------------------------------ */
/*  Illustrative staging                                                */
/* ------------------------------------------------------------------ */

/** Every staged piece merged per material into one group; nothing in it is pickable. */
function buildStaging(ctx: BuildCtx, pieces: StagedPiece[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'staging';
  const buckets = new Map<THREE.Material, Bucket>();
  const bucket = (m: THREE.Material): Bucket => {
    let b = buckets.get(m);
    if (!b) {
      b = new Bucket();
      buckets.set(m, b);
    }
    return b;
  };
  for (const piece of pieces) {
    // local frame: x to the piece's right, z toward its front (the back is the wall side), y up
    const base = frameAt(piece.x, piece.y, 0, piece.facing + Math.PI / 2);
    const put: Put = (mat, geom, lx, ly, lz) => bucket(mat).add(geom, offset(base, lx, ly, lz));
    const putM = (mat: THREE.Material, geom: THREE.BufferGeometry, m: THREE.Matrix4): void => bucket(mat).add(geom, m);
    addStagedPiece(piece, put, putM, base, ctx.box, ctx.rbox, ctx.mats);
  }
  for (const [mat, b] of buckets) {
    const g = b.merge();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mat !== ctx.mats.stRug && mat !== ctx.mats.stRugEdge;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

const cyl = (rt: number, rb: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);

function addStagedPiece(
  piece: StagedPiece,
  put: Put,
  putM: (mat: THREE.Material, geom: THREE.BufferGeometry, m: THREE.Matrix4) => void,
  base: THREE.Matrix4,
  box: BoxFn,
  rbox: BoxFn,
  mats: Mats,
): void {
  const { w, d } = piece;
  switch (piece.kind) {
    case 'bed': {
      put(mats.stWalnut, rbox(w, 0.22, d), 0, 0.11, 0);
      put(mats.stLinen, rbox(w - 0.04, 0.2, d - 0.04), 0, 0.32, 0);
      put(mats.stWalnut, box(w + 0.08, 0.95, 0.06), 0, 0.475, -d / 2 + 0.03);
      const pw = Math.min(0.55, w * 0.4);
      const pd = 0.38;
      const lz = -d / 2 + 0.12 + pd / 2;
      if (w >= 1.4) {
        put(mats.stLinen, rbox(pw, 0.11, pd), w * 0.24, 0.475, lz);
        put(mats.stLinen, rbox(pw, 0.11, pd), -w * 0.24, 0.475, lz);
      } else {
        put(mats.stLinen, rbox(pw, 0.11, pd), 0, 0.475, lz);
      }
      put(mats.stFabric, rbox(w - 0.12, 0.05, 0.55), 0, 0.445, d / 2 - 0.36);
      break;
    }
    case 'nightstand': {
      put(mats.stWalnut, rbox(w, 0.5, d), 0, 0.25, 0);
      put(mats.stMetal, cyl(0.035, 0.05, 0.3, 10), 0, 0.65, 0);
      put(mats.stLinen, cyl(0.13, 0.13, 0.15, 14), 0, 0.87, 0);
      break;
    }
    case 'wardrobe': {
      put(mats.stWalnut, box(w - 0.04, 0.06, d - 0.04), 0, 0.03, 0);
      put(mats.stLinen, rbox(w, 2.1, d), 0, 1.11, 0);
      for (const lx of [-0.05, 0.05]) put(mats.stMetal, box(0.02, 0.3, 0.02), lx, 1.0, d / 2 + 0.01);
      break;
    }
    case 'rug': {
      // sits on the floor patch (FLOOR_LIFT) with its top just above the highlight overlay
      put(mats.stRug, box(w, 0.02, d), 0, FLOOR_LIFT + 0.01, 0);
      const y = FLOOR_LIFT + 0.021;
      const bw = 0.07;
      put(mats.stRugEdge, flatRect(w, bw), 0, y, d / 2 - bw / 2);
      put(mats.stRugEdge, flatRect(w, bw), 0, y, -d / 2 + bw / 2);
      put(mats.stRugEdge, flatRect(bw, d - 2 * bw), w / 2 - bw / 2, y, 0);
      put(mats.stRugEdge, flatRect(bw, d - 2 * bw), -w / 2 + bw / 2, y, 0);
      break;
    }
    case 'sofa':
    case 'armchair': {
      put(mats.stFabric, rbox(w, 0.4, d), 0, 0.2, 0);
      put(mats.stFabric, rbox(w, 0.38, 0.2), 0, 0.59, -d / 2 + 0.1);
      for (const s of [-1, 1]) put(mats.stFabric, rbox(0.18, 0.18, d - 0.05), s * (w / 2 - 0.09), 0.49, 0);
      const seats = Math.max(1, Math.round((w - 0.36) / 0.7));
      const segW = (w - 0.36) / seats;
      for (let k = 0; k < seats; k++) {
        put(mats.stLinen, rbox(segW - 0.04, 0.08, d - 0.36), -w / 2 + 0.18 + segW * (k + 0.5), 0.44, 0.08);
      }
      break;
    }
    case 'coffeeTable': {
      put(mats.stWalnut, rbox(w, 0.035, d), 0, 0.4, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.stMetal, box(0.03, 0.38, 0.03), sx * (w / 2 - 0.06), 0.19, sz * (d / 2 - 0.06));
      break;
    }
    case 'tvUnit': {
      put(mats.stWalnut, rbox(w, 0.48, d), 0, 0.24, 0);
      put(mats.stMetal, box(0.3, 0.18, 0.02), 0, 0.57, -d / 2 + 0.06);
      put(mats.stScreen, box(1.2, 0.7, 0.05), 0, 1.0, -d / 2 + 0.06);
      break;
    }
    case 'plant': {
      put(mats.stMetal, cyl(0.17, 0.14, 0.38, 12), 0, 0.19, 0);
      put(mats.stWalnut, cyl(0.02, 0.03, 0.4, 6), 0, 0.55, 0);
      put(mats.stLeaf, new THREE.SphereGeometry(0.3, 12, 8), 0, 0.78, 0);
      put(mats.stLeaf, new THREE.SphereGeometry(0.22, 10, 7), 0.15, 0.98, 0.1);
      put(mats.stLeaf, new THREE.SphereGeometry(0.2, 10, 7), -0.14, 0.92, -0.12);
      break;
    }
    case 'diningTable': {
      put(mats.stWalnut, rbox(w, 0.04, d), 0, 0.74, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.stWalnut, box(0.06, 0.72, 0.06), sx * (w / 2 - 0.1), 0.36, sz * (d / 2 - 0.1));
      break;
    }
    case 'chair': {
      put(mats.stFabric, rbox(w - 0.03, 0.05, d - 0.03), 0, 0.46, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.stMetal, box(0.025, 0.44, 0.025), sx * (w / 2 - 0.05), 0.22, sz * (d / 2 - 0.05));
      put(mats.stWalnut, rbox(w - 0.05, 0.42, 0.03), 0, 0.69, -d / 2 + 0.03);
      break;
    }
    case 'sideboard': {
      put(mats.stWalnut, rbox(w, 0.8, d), 0, 0.4, 0);
      put(mats.stLinen, cyl(0.07, 0.05, 0.28, 10), w * 0.3, 0.94, 0);
      break;
    }
    case 'desk': {
      put(mats.stWalnut, rbox(w, 0.035, d), 0, 0.74, 0);
      for (const s of [-1, 1]) put(mats.stMetal, box(0.03, 0.72, d - 0.06), s * (w / 2 - 0.05), 0.36, 0);
      break;
    }
    case 'bookshelf': {
      for (const s of [-1, 1]) put(mats.stWalnut, box(0.03, 2.0, d), s * (w / 2 - 0.015), 1.0, 0);
      put(mats.stWalnut, box(w, 0.03, d), 0, 1.985, 0);
      put(mats.stWalnut, box(w, 0.03, d), 0, 0.015, 0);
      [0.5, 1.0, 1.5].forEach((y, k) => {
        put(mats.stWalnut, box(w - 0.06, 0.025, d - 0.02), 0, y, 0);
        const run = w * 0.5;
        put(mats.stLinen, rbox(run, 0.26, d - 0.12), (k % 2 ? 1 : -1) * (w / 2 - 0.05 - run / 2), y + 0.14, 0);
        put(mats.stFabric, rbox(w * 0.22, 0.2, d - 0.14), (k % 2 ? -1 : 1) * (w / 2 - 0.05 - w * 0.11), y + 0.11, 0);
      });
      break;
    }
    case 'lounger': {
      put(mats.stLinen, rbox(w, 0.12, d), 0, 0.3, 0);
      // backrest pitched up toward the head end
      putM(mats.stLinen, rbox(w - 0.04, 0.1, 0.6), offset(base, 0, 0.52, -d / 2 + 0.3).multiply(_m1.makeRotationX(0.55)));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.stMetal, box(0.04, 0.24, 0.04), sx * (w / 2 - 0.06), 0.12, sz * (d / 2 - 0.1));
      break;
    }
    case 'roundTable': {
      put(mats.stMetal, cyl(w / 2, w / 2, 0.03, 18), 0, 0.5, 0);
      put(mats.stMetal, cyl(0.02, 0.02, 0.48, 8), 0, 0.25, 0);
      put(mats.stMetal, cyl(0.15, 0.15, 0.02, 14), 0, 0.01, 0);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Zones: car park, ramps, columns, water, planting                    */
/* ------------------------------------------------------------------ */

/** Asphalt apron over a parking zone. Drive-aisle centre lines are not drawn: the sheets don't carry them. */
function addParkingApron(ctx: BuildCtx, ring: Ring): void {
  const shape = shapeFrom(ring);
  if (!shape) return;
  const m = new THREE.Mesh(planPatch(shape, FLOOR_LIFT), ctx.mats.asphalt);
  m.receiveShadow = true;
  ctx.group.add(m);
}

/**
 * A sloped concrete ramp: the ring extruded 0.25 m and tilted about its low end so the end farther
 * from the plan centre rises 20 % of its length, with chevrons painted across it and curbs along its sides.
 */
function addRamp(ctx: BuildCtx, ring: Ring): void {
  const { mats, bucket, box } = ctx;
  const c = ringCentroid(ring);
  let { ux, uy } = principalAxis(ring);
  let tmin = Infinity;
  let tmax = -Infinity;
  for (const [x, y] of ring) {
    const t = (x - c[0]) * ux + (y - c[1]) * uy;
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
  }
  // the end farther from the plan centre is the high end: point the axis at it
  const [pcx, pcy] = ctx.planCenter;
  const dLo = Math.hypot(c[0] + ux * tmin - pcx, c[1] + uy * tmin - pcy);
  const dHi = Math.hypot(c[0] + ux * tmax - pcx, c[1] + uy * tmax - pcy);
  if (dLo > dHi) {
    ux = -ux;
    uy = -uy;
    const t = tmin;
    tmin = -tmax;
    tmax = -t;
  }
  const origin: Pt = [c[0] + ux * tmin, c[1] + uy * tmin];
  const vx = -uy;
  const vy = ux;
  // ring in the ramp's own frame: u up the slope from the low end, v across
  const local: Ring = ring.map(([x, y]) => [(x - origin[0]) * ux + (y - origin[1]) * uy, (x - origin[0]) * vx + (y - origin[1]) * vy]);
  const length = tmax - tmin;
  if (!(length > 0.5)) return;
  const shape = shapeFrom(local);
  if (!shape) return;
  const tilt = Math.atan(RAMP_SLOPE);
  // world = place the low end, yaw to the axis, then pitch the whole slab up about that end
  const frame = frameAt(origin[0], origin[1], 0, Math.atan2(uy, ux)).multiply(_m1.makeRotationZ(tilt));

  bucket(mats.concrete).add(extrudePlan(shape, RAMP_T, -RAMP_T), frame);

  // chevrons every 1.5 m, each clipped to the ring's width at that station
  const crossings: number[] = [];
  const crossings2: number[] = [];
  const apex = RAMP_STRIPE_W * 0.75;
  for (let u0 = RAMP_STRIPE_STEP * 0.6; u0 + RAMP_STRIPE_W + apex < length; u0 += RAMP_STRIPE_STEP) {
    ringCrossings(local, u0, crossings);
    ringCrossings(local, u0 + RAMP_STRIPE_W + apex, crossings2);
    if (crossings.length < 2 || crossings2.length < 2) continue;
    const v0 = Math.max(crossings[0], crossings2[0]) + 0.2;
    const v1 = Math.min(crossings[crossings.length - 1], crossings2[crossings2.length - 1]) - 0.2;
    if (v1 - v0 < 0.6) continue;
    const vm = (v0 + v1) / 2;
    const chevron = new THREE.Shape([
      new THREE.Vector2(u0, v0),
      new THREE.Vector2(u0 + RAMP_STRIPE_W, v0),
      new THREE.Vector2(u0 + RAMP_STRIPE_W + apex, vm),
      new THREE.Vector2(u0 + RAMP_STRIPE_W, v1),
      new THREE.Vector2(u0, v1),
      new THREE.Vector2(u0 + apex, vm),
    ]);
    bucket(mats.chevron).add(planPatch(chevron, BAY_LINE_LIFT), frame);
  }

  // low curbs along the edges that run with the slope
  let vMean = 0;
  for (const p of local) vMean += p[1];
  vMean /= local.length;
  for (let i = 0, j = local.length - 1; i < local.length; j = i++) {
    const f = segFrame([local[j][0], local[j][1], local[i][0], local[i][1]]);
    if (!f || Math.abs(f.ux) < 0.85 || f.len < 0.8) continue;
    const inward = f.cy < vMean ? 0.075 : -0.075;
    bucket(mats.curb).add(box(f.len, 0.15, 0.15), offsetRot(frame, f.cx, 0.075, -(f.cy + inward), f.angle));
  }
}

/** Free-standing concrete columns, instanced: one draw call per shape plus one for the capital bands. */
function addColumns(ctx: BuildCtx): void {
  const cols = (ctx.plan.columns ?? []).filter((c) => c.w > 0.05 && c.d > 0.05);
  if (cols.length === 0) return;
  const { mats, group, wallH } = ctx;
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, yUp: number, w: number, h: number, d: number): void => {
    _m1.makeScale(w, h, d);
    _m1.setPosition(x, yUp, -y);
    mesh.setMatrixAt(i, _m1);
  };
  for (const round of [false, true]) {
    const list = cols.filter((c) => Boolean(c.round) === round);
    if (list.length === 0) continue;
    const shaftGeom = round ? new THREE.CylinderGeometry(0.5, 0.5, 1, 18) : new THREE.BoxGeometry(1, 1, 1);
    const capGeom = round ? new THREE.CylinderGeometry(0.5, 0.5, 1, 18) : new THREE.BoxGeometry(1, 1, 1);
    const shafts = new THREE.InstancedMesh(shaftGeom, mats.column, list.length);
    const caps = new THREE.InstancedMesh(capGeom, mats.columnCap, list.length);
    list.forEach((c, i) => {
      place(shafts, i, c.x, c.y, wallH / 2, c.w, wallH, c.d);
      place(caps, i, c.x, c.y, wallH - COLUMN_CAP_H / 2, c.w + 0.05, COLUMN_CAP_H, c.d + 0.05);
    });
    for (const m of [shafts, caps]) {
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
}

type BayFrame = {
  cx: number;
  cy: number;
  /** Plan angle of the long axis. */
  angle: number;
  len: number;
  wid: number;
  /** +1 / -1: which end along the long axis is the closed (painted) end. */
  closed: 1 | -1;
};

/** Bay rectangles resolved to a long-axis frame, with the closed end chosen from the row layout. */
function bayFrames(plan: Plan3D, planCenter: Pt): BayFrame[] {
  const raw = (plan.bays ?? []).map((b) => {
    const [x0, y0, x1, y1] = b.box;
    const w = x1 - x0;
    const d = y1 - y0;
    const longX = w >= d;
    const rot = (b.rot ?? 0) * DEG;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, angle: rot + (longX ? 0 : Math.PI / 2), len: Math.max(w, d), wid: Math.min(w, d) };
  });
  return raw.map((f) => {
    const dx = Math.cos(f.angle);
    const dy = Math.sin(f.angle);
    // an end with another bay directly behind it is back-to-back, hence closed
    const backed = (s: number): boolean => {
      const bx = f.cx + s * dx * f.len;
      const by = f.cy + s * dy * f.len;
      return raw.some((o) => o !== f && Math.hypot(o.cx - bx, o.cy - by) < f.len * 0.65);
    };
    const bPos = backed(1);
    const bNeg = backed(-1);
    let closed: 1 | -1;
    if (bPos !== bNeg) closed = bPos ? 1 : -1;
    else {
      // along a wall or ambiguous: the end farther from the plan centre is against the wall
      const dPos = Math.hypot(f.cx + dx * f.len - planCenter[0], f.cy + dy * f.len - planCenter[1]);
      const dNeg = Math.hypot(f.cx - dx * f.len - planCenter[0], f.cy - dy * f.len - planCenter[1]);
      closed = dPos >= dNeg ? 1 : -1;
    }
    return { ...f, closed };
  });
}

/** Painted bay lines, hover overlays + pills, and the parked cars. */
function addBays(ctx: BuildCtx): BayNode[] {
  const { mats, group, bucket } = ctx;
  const frames = bayFrames(ctx.plan, ctx.planCenter);
  const nodes: BayNode[] = [];
  if (frames.length === 0) return nodes;
  const bays = ctx.plan.bays ?? [];

  frames.forEach((f, index) => {
    if (!(f.len > 0.5) || !(f.wid > 0.5)) return;
    const base = frameAt(f.cx, f.cy, 0, f.angle);
    // the two long edges and the closed short end, as flat painted strips
    bucket(mats.bayLine).add(flatRect(f.len, BAY_LINE_W), offset(base, 0, BAY_LINE_LIFT, f.wid / 2 - BAY_LINE_W / 2));
    bucket(mats.bayLine).add(flatRect(f.len, BAY_LINE_W), offset(base, 0, BAY_LINE_LIFT, -f.wid / 2 + BAY_LINE_W / 2));
    bucket(mats.bayLine).add(flatRect(BAY_LINE_W, f.wid), offset(base, f.closed * (f.len / 2 - BAY_LINE_W / 2), BAY_LINE_LIFT, 0));

    // hover / selection overlay (also the pick target) and its outline
    const overlayGeom = flatRect(f.len, f.wid);
    overlayGeom.applyMatrix4(offset(base, 0, HIGHLIGHT_LIFT + 0.005, 0));
    const overlay = new THREE.Mesh(overlayGeom, mats.hover);
    overlay.visible = false;
    overlay.renderOrder = 1;
    group.add(overlay);
    const corners: number[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      _v.set((sx * f.len) / 2, HIGHLIGHT_LIFT + 0.015, (sz * f.wid) / 2).applyMatrix4(base);
      corners.push(_v.x, _v.y, _v.z);
    }
    const outlineGeom = lineGeometry(corners);
    const outline = outlineGeom ? new THREE.LineLoop(outlineGeom, mats.hoverEdge) : null;
    if (outline) {
      outline.visible = false;
      outline.renderOrder = 1;
      group.add(outline);
    }

    const label = bays[index]?.label?.trim() ?? '';
    const code = bayResidenceCode(label);
    const el = document.createElement('div');
    el.className = 'fp3d-label fp3d-bay is-pinned';
    // a bay names its residence; otherwise whatever the sheet wrote ("Shared", "Accessible"…)
    el.textContent = code ?? (/^pool$/i.test(label) ? 'Shared' : label || 'Bay');
    // the pill never takes the pointer (it would steal the hover that shows it); clicking the bay selects
    if (code) el.classList.add('is-owned');
    const pill = new CSS2DObject(el);
    pill.position.set(f.cx, 0.6, -f.cy);
    pill.visible = false;
    group.add(pill);
    nodes.push({ index, code, overlay, outline, label: pill });
    // shown only while lit, when it outranks everything around it
    ctx.labels.push(makeLabelEntry(el, pill, PRIORITY_LIT, null, { pinned: true }));

    // the number painted on the asphalt at the head end, read from the aisle
    if (label) {
      const text = code ?? (/^pool$/i.test(label) ? 'Shared' : label);
      const mat = ctx.bayText.get(text);
      ctx.noShadow.add(mat);
      // text runs across the bay; its "up" points at the closed end, so a driver in the aisle reads it upright
      const lx = -f.closed * (f.len / 2 - BAY_LINE_W - BAY_PAINT_INSET - BAY_PAINT_H / 2);
      bucket(mat).add(flatRect(BAY_PAINT_W, BAY_PAINT_H), offsetRot(base, lx, BAY_PAINT_LIFT, 0, (-f.closed * Math.PI) / 2));
    }
  });

  /* ---------- cars: ~45 % of bays, one InstancedMesh per part ---------- */
  // the sheets draw 1.8 m bays: a car squeezes to leave 0.2 m either side, never wider than itself
  const parked = frames.filter((f, i) => f.len > CAR_L + 0.2 && f.wid > 1.5 && hash01(i * 3.7 + 1.1) < CAR_SHARE);
  if (parked.length === 0) return nodes;
  const bodyGeom = new RoundedBoxGeometry(CAR_L, CAR_BODY_H, CAR_W, 2, 0.12);
  const cabinGeom = new RoundedBoxGeometry(2.0, 0.55, 1.6, 2, 0.16);
  const wheelGeom = new THREE.CylinderGeometry(CAR_WHEEL_R, CAR_WHEEL_R, 0.22, 14);
  wheelGeom.rotateX(Math.PI / 2); // axle across the car
  const bodies = new THREE.InstancedMesh(bodyGeom, mats.carBody, parked.length);
  const cabins = new THREE.InstancedMesh(cabinGeom, mats.carGlass, parked.length);
  const wheels = new THREE.InstancedMesh(wheelGeom, mats.wheel, parked.length * 4);
  const tint = new THREE.Color();
  const bodyY = CAR_WHEEL_R + CAR_BODY_H / 2 - 0.05;
  parked.forEach((f, i) => {
    // nose toward the aisle: park the car against the closed end, clear of the painted number
    const back = f.closed * Math.max(0, (f.len - CAR_L) / 2 - CAR_REAR_GAP);
    const squeeze = Math.min(1, (f.wid - 0.35) / CAR_W);
    const car = frameAt(f.cx, f.cy, 0, f.angle);
    // width squeeze is a local z scale, applied after the placement so the wheelbase follows
    bodies.setMatrixAt(i, offset(car, back, bodyY, 0).multiply(_m1.makeScale(1, 1, squeeze)));
    bodies.setColorAt(i, tint.setHex(CAR_PALETTE[i % CAR_PALETTE.length]));
    cabins.setMatrixAt(i, offset(car, back + f.closed * 0.25, bodyY + CAR_BODY_H / 2 + 0.27, 0).multiply(_m1.makeScale(1, 1, squeeze)));
    let k = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.setMatrixAt(i * 4 + k++, offset(car, back + sx * 1.35, CAR_WHEEL_R, sz * 0.8 * squeeze));
  });
  for (const m of [bodies, cabins, wheels]) {
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  cabins.renderOrder = 2;
  return nodes;
}

/**
 * A pool or reflecting basin: mosaic-lined walls and floor cut into the slab, stone coping around it,
 * and a transmissive, rippling water surface. Basement pools get their skylight.
 */
function addWater(ctx: BuildCtx, ring: Ring, label?: string): void {
  const { mats, group, bucket, box } = ctx;
  const shape = shapeFrom(ring);
  if (!shape) return;
  const depth = ctx.parking ? POOL_DEPTH : FEATURE_DEPTH;
  const centroid = ringCentroid(ring);
  const isPool = ctx.parking || Math.abs(ringSignedArea(ring)) > 12;

  // basin: floor + inward-facing walls (DoubleSide tile), textured in metres
  const floor = planPatch(shape, -depth);
  bucket(mats.poolTile).add(floor);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = segFrame([ring[j][0], ring[j][1], ring[i][0], ring[i][1]]);
    if (!f) continue;
    bucket(mats.poolTile).add(metreUV(new THREE.PlaneGeometry(f.len, depth), f.len, depth), frameAt(f.cx, f.cy, -depth / 2, f.angle));
  }

  // coping / deck ring
  const outer = offsetRing(ring, COPING_W);
  const copingShape = shapeFrom(outer, [ring]);
  if (copingShape) bucket(mats.coping).add(extrudePlan(copingShape, 0.03, 0));

  // water surface — its own mesh so it can sit after the glass in the transmission pass
  const water = new THREE.Mesh(planPatch(shape, WATER_LEVEL), mats.water);
  water.receiveShadow = true;
  water.renderOrder = 3;
  group.add(water);

  const el = document.createElement('div');
  el.className = 'fp3d-label is-pinned is-key';
  el.textContent = label?.trim() || (isPool ? 'Swimming pool' : 'Water feature');
  const pill = new CSS2DObject(el);
  pill.position.set(centroid[0], 0.08, -centroid[1]);
  group.add(pill);
  // a landmark: exempt from the fit-in-room rule, so it names the basin at any zoom
  ctx.labels.push(makeLabelEntry(el, pill, PRIORITY_KEY, ring, { pinned: true, fit: false }));

  // the B1 sheet notes a skylight above the pool
  if (ctx.parking) {
    const [x0, y0, x1, y1] = ringBBox(ring);
    const alongX = x1 - x0 >= y1 - y0;
    const L = 6;
    const W = 4;
    const base = frameAt(centroid[0], centroid[1], SKYLIGHT_H, alongX ? 0 : Math.PI / 2);
    bucket(mats.skyGlass).add(box(L, 0.03, W), base);
    const bar = 0.08;
    bucket(mats.bronze).add(box(L + bar, bar, bar), offset(base, 0, 0, -W / 2));
    bucket(mats.bronze).add(box(L + bar, bar, bar), offset(base, 0, 0, W / 2));
    bucket(mats.bronze).add(box(bar, bar, W), offset(base, -L / 2, 0, 0));
    bucket(mats.bronze).add(box(bar, bar, W), offset(base, L / 2, 0, 0));
    for (const k of [-1, 0, 1]) bucket(mats.bronze).add(box(0.05, 0.06, W), offset(base, (k * L) / 4, 0, 0));
    bucket(mats.bronze).add(box(L, 0.06, 0.05), base);
  }
}

/** Lawn over a garden zone with a run of hedge blobs hugging its edge. */
function addGarden(ctx: BuildCtx, ring: Ring): void {
  const { mats, group, bucket } = ctx;
  const shape = shapeFrom(ring);
  if (!shape) return;
  const lawn = new THREE.Mesh(planPatch(shape, FLOOR_LIFT), mats.lawn);
  lawn.receiveShadow = true;
  group.add(lawn);
  const perimeter = ringPerimeter(ring);
  const n = Math.min(10, Math.max(6, Math.round(perimeter / 2.5)));
  const [cx, cy] = ringCentroid(ring);
  const seed = perimeter * 3.7 + cx;
  for (let k = 0; k < n; k++) {
    const [px, py] = pointAlongRing(ring, ((k + 0.5) * perimeter) / n);
    const dx = cx - px;
    const dy = cy - py;
    const d = Math.hypot(dx, dy) || 1;
    const r = 0.35 + hash01(seed + k * 1.31) * 0.25;
    const inset = r + 0.1;
    const x = px + (dx / d) * inset;
    const y = py + (dy / d) * inset;
    bucket(mats.hedge).add(new THREE.SphereGeometry(r, 12, 9), frameAt(x, y, r * 0.75, 0));
  }
}

/** A planter box with green blobs on top, in `mats.generic` stone. */
function addPlanterBox(ctx: BuildCtx, base: THREE.Matrix4, w: number, d: number, h: number, seed: number): void {
  const { mats, bucket, rbox } = ctx;
  bucket(mats.generic).add(rbox(w, h, d), offset(base, 0, h / 2, 0));
  const blobs = Math.max(1, Math.round((w * d) / 0.2));
  for (let k = 0; k < blobs; k++) {
    const r = 0.16 + hash01(seed + k * 2.17) * 0.1;
    const lx = (hash01(seed + k * 3.1) - 0.5) * Math.max(0, w - 2 * r);
    const lz = (hash01(seed + k * 5.3) - 0.5) * Math.max(0, d - 2 * r);
    bucket(k % 2 ? mats.leafDark : mats.hedge).add(new THREE.SphereGeometry(r, 10, 7), offset(base, lx, h + r * 0.55, lz));
  }
}

/** Pavers over a terrace zone, planters along its longest edge, and lounge chairs on the larger ones. */
function addTerrace(ctx: BuildCtx, ring: Ring): void {
  const { mats, group, bucket, rbox } = ctx;
  const shape = shapeFrom(ring);
  if (!shape) return;
  const patch = new THREE.Mesh(planPatch(shape, FLOOR_LIFT + 0.003), mats.terrace);
  patch.receiveShadow = true;
  group.add(patch);
  const edge = longestEdge(ring);
  if (!edge) return;
  const [cx, cy] = ringCentroid(ring);
  // inward = the edge normal that points at the centroid
  let nx = -edge.uy;
  let ny = edge.ux;
  if ((cx - edge.cx) * nx + (cy - edge.cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const area = Math.abs(ringSignedArea(ring));
  const seed = cx * 1.7 + cy * 0.3;
  const boxes = edge.len > 5 ? 3 : 2;
  for (let k = 0; k < boxes; k++) {
    const t = ((k + 1) / (boxes + 1) - 0.5) * edge.len * 0.8;
    const px = edge.cx + edge.ux * t + nx * 0.4;
    const py = edge.cy + edge.uy * t + ny * 0.4;
    if (!pointInRing(px, py, ring)) continue;
    addPlanterBox(ctx, frameAt(px, py, 0, edge.angle), 0.9, 0.45, 0.5, seed + k);
  }
  if (area > LOUNGE_MIN_AREA) {
    for (const s of [-1, 1]) {
      const px = cx + nx * 0.2 + edge.ux * s * 0.55;
      const py = cy + ny * 0.2 + edge.uy * s * 0.55;
      if (!pointInRing(px, py, ring)) continue;
      // seat along the inward normal, back raised toward the edge
      const base = frameAt(px, py, 0, edge.angle + Math.PI / 2);
      bucket(mats.linen).add(rbox(1.5, 0.12, 0.7), offset(base, 0, 0.3, 0));
      bucket(mats.linen).add(rbox(0.7, 0.12, 0.7), offsetRot(base, -0.95, 0.5, 0, 0).multiply(_m2.makeRotationZ(-0.6)));
      for (const lx of [-0.6, 0.6]) for (const lz of [-0.28, 0.28]) bucket(mats.chair).add(ctx.box(0.04, 0.24, 0.04), offset(base, lx, 0.12, lz));
    }
  }
}

/** A planter zone: a stone box filling the ring with a bed of green blobs on top. */
function addPlanter(ctx: BuildCtx, ring: Ring): void {
  const { mats, bucket } = ctx;
  const shape = shapeFrom(ring);
  if (!shape) return;
  const h = 0.5;
  bucket(mats.generic).add(extrudePlan(shape, h));
  const [x0, y0, x1, y1] = ringBBox(ring);
  const seed = x0 * 0.9 + y1 * 1.3;
  let k = 0;
  for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.6) {
    for (let y = y0 + 0.35; y < y1 - 0.2; y += 0.6) {
      const jx = x + (hash01(seed + k * 1.7) - 0.5) * 0.3;
      const jy = y + (hash01(seed + k * 2.9) - 0.5) * 0.3;
      k++;
      if (!pointInRing(jx, jy, ring)) continue;
      const r = 0.2 + hash01(seed + k * 4.1) * 0.12;
      const mat = k % 3 === 0 ? mats.leaf : k % 3 === 1 ? mats.leafDark : mats.hedge;
      bucket(mat).add(new THREE.SphereGeometry(r, 10, 7), frameAt(jx, jy, h + r * 0.5, 0));
    }
  }
}

type Put = (mat: THREE.Material, geom: THREE.BufferGeometry, lx: number, ly: number, lz: number) => void;
type BoxFn = (w: number, h: number, d: number) => THREE.BufferGeometry;

function addFurniture(
  kind: FurnitureKind,
  w: number,
  d: number,
  h: number,
  longX: boolean,
  put: Put,
  box: BoxFn,
  rbox: BoxFn,
  mats: Mats,
  base: THREE.Matrix4,
  edgeVerts: number[],
): void {
  switch (kind) {
    case 'bed': {
      put(mats.linen, rbox(w, h, d), 0, h / 2, 0);
      const hbH = h + 0.6;
      if (longX) {
        // headboard at the xmin end, pillows beside it, throw folded at the foot
        put(mats.walnut, box(0.1, hbH, d), -w / 2 + 0.05, hbH / 2, 0);
        const pw = Math.min(0.55, w * 0.25);
        const pd = Math.min(0.4, d * 0.4);
        put(mats.pillow, rbox(pw, 0.12, pd), -w / 2 + 0.12 + pw / 2, h + 0.06, d * 0.22);
        put(mats.pillow, rbox(pw, 0.12, pd), -w / 2 + 0.12 + pw / 2, h + 0.06, -d * 0.22);
        put(mats.throw, rbox(w * 0.26, 0.06, d * 0.9), w / 2 - 0.1 - w * 0.13, h + 0.03, 0);
      } else {
        // headboard at the ymin end (local +z)
        put(mats.walnut, box(w, hbH, 0.1), 0, hbH / 2, d / 2 - 0.05);
        const pw = Math.min(0.4, w * 0.4);
        const pd = Math.min(0.55, d * 0.25);
        put(mats.pillow, rbox(pw, 0.12, pd), w * 0.22, h + 0.06, d / 2 - 0.12 - pd / 2);
        put(mats.pillow, rbox(pw, 0.12, pd), -w * 0.22, h + 0.06, d / 2 - 0.12 - pd / 2);
        put(mats.throw, rbox(w * 0.9, 0.06, d * 0.26), 0, h + 0.03, -d / 2 + 0.1 + d * 0.13);
      }
      break;
    }
    case 'sofa': {
      put(mats.fabric, rbox(w, h, d), 0, h / 2, 0);
      if (longX) {
        put(mats.fabric, rbox(w, 0.35, 0.22), 0, h + 0.175, -d / 2 + 0.11);
        put(mats.fabric, rbox(0.16, 0.15, d), -w / 2 + 0.08, h + 0.075, 0);
        put(mats.fabric, rbox(0.16, 0.15, d), w / 2 - 0.08, h + 0.075, 0);
      } else {
        put(mats.fabric, rbox(0.22, 0.35, d), -w / 2 + 0.11, h + 0.175, 0);
        put(mats.fabric, rbox(w, 0.15, 0.16), 0, h + 0.075, -d / 2 + 0.08);
        put(mats.fabric, rbox(w, 0.15, 0.16), 0, h + 0.075, d / 2 - 0.08);
      }
      break;
    }
    case 'table': {
      put(mats.walnut, rbox(w, 0.05, d), 0, h - 0.025, 0);
      const legH = h - 0.05;
      const ix = Math.max(0.03, w / 2 - 0.08);
      const iz = Math.max(0.03, d / 2 - 0.08);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.walnut, box(0.06, legH, 0.06), sx * ix, legH / 2, sz * iz);
      break;
    }
    case 'chair': {
      const seatY = h * 0.5;
      put(mats.chair, rbox(w * 0.9, 0.06, d * 0.9), 0, seatY, 0);
      const ix = Math.max(0.02, w * 0.45 - 0.04);
      const iz = Math.max(0.02, d * 0.45 - 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.chair, box(0.03, seatY, 0.03), sx * ix, seatY / 2, sz * iz);
      put(mats.chair, rbox(w * 0.9, h - seatY, 0.05), 0, seatY + (h - seatY) / 2, -d / 2 + 0.05);
      break;
    }
    case 'kitchen': {
      const bodyH = h - 0.04;
      put(mats.counter, rbox(w, bodyH, d), 0, bodyH / 2, 0);
      put(mats.darkStone, box(w + 0.02, 0.04, d + 0.02), 0, h - 0.02, 0);
      if (longX) put(mats.counter, box(w, 0.5, 0.03), 0, h + 0.25, -d / 2 + 0.015);
      else put(mats.counter, box(0.03, 0.5, d), -w / 2 + 0.015, h + 0.25, 0);
      break;
    }
    case 'closet': {
      put(mats.closet, rbox(w, h, d), 0, h / 2, 0);
      // door divisions on the front face
      const v = new THREE.Vector3();
      const pushLine = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
        v.set(ax, ay, az).applyMatrix4(base);
        edgeVerts.push(v.x, v.y, v.z);
        v.set(bx, by, bz).applyMatrix4(base);
        edgeVerts.push(v.x, v.y, v.z);
      };
      if (longX) {
        const n = Math.max(1, Math.round(w / 0.5));
        for (let k = 1; k < n; k++) {
          const lx = -w / 2 + (k * w) / n;
          pushLine(lx, 0.03, d / 2 + 0.003, lx, h - 0.03, d / 2 + 0.003);
        }
      } else {
        const n = Math.max(1, Math.round(d / 0.5));
        for (let k = 1; k < n; k++) {
          const lz = -d / 2 + (k * d) / n;
          pushLine(-w / 2 - 0.003, 0.03, lz, -w / 2 - 0.003, h - 0.03, lz);
        }
      }
      break;
    }
    case 'bath': {
      put(mats.ceramic, rbox(w, h, d), 0, h / 2, 0);
      put(mats.ceramicInset, box(Math.max(0.05, w - 0.2), 0.012, Math.max(0.05, d - 0.2)), 0, h + 0.004, 0);
      break;
    }
    case 'wc': {
      const tankD = Math.min(0.2, d * 0.3);
      put(mats.ceramic, rbox(w, h, tankD), 0, h / 2, -d / 2 + tankD / 2);
      const bowlH = h * 0.55;
      put(mats.ceramic, rbox(w * 0.8, bowlH, d - tankD - 0.02), 0, bowlH / 2, tankD / 2 + 0.01);
      break;
    }
    case 'sink': {
      put(mats.ceramic, rbox(w, h, d), 0, h / 2, 0);
      put(mats.ceramicInset, box(Math.max(0.05, w - 0.14), 0.012, Math.max(0.05, d - 0.14)), 0, h + 0.004, 0);
      break;
    }
    case 'fridge': {
      put(mats.metal, rbox(w, h, d), 0, h / 2, 0);
      break;
    }
    case 'oven': {
      put(mats.oven, rbox(w, h, d), 0, h / 2, 0);
      break;
    }
    case 'plant': {
      const r = Math.min(w, d) / 2;
      put(mats.oven, new THREE.CylinderGeometry(r * 0.7, r * 0.55, Math.min(0.35, h * 0.3), 12), 0, Math.min(0.35, h * 0.3) / 2, 0);
      put(mats.trunk, new THREE.CylinderGeometry(r * 0.08, r * 0.1, h * 0.6, 6), 0, h * 0.4, 0);
      put(mats.leaf, new THREE.SphereGeometry(r * 0.95, 12, 8), 0, h * 0.72, 0);
      put(mats.leafDark, new THREE.SphereGeometry(r * 0.7, 10, 7), r * 0.4, h * 0.62, r * 0.3);
      put(mats.leaf, new THREE.SphereGeometry(r * 0.6, 10, 7), -r * 0.4, h * 0.85, -r * 0.25);
      break;
    }
    default: {
      put(mats.generic, rbox(w, h, d), 0, h / 2, 0);
    }
  }
}

function disposeLevel(level: Level): void {
  level.group.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
    // patch + overlay share a geometry; a second dispose() is a no-op in three
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose(); // instance matrix / colour buffers
  });
  level.group.removeFromParent();
  level.group.clear();
  level.rooms.length = 0;
  level.bays.length = 0;
  level.labels.length = 0;
  level.pickables.length = 0;
  level.pins.clear();
  level.aptBounds.clear();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Api = {
  setPlan: (plan: Plan3D, kind: FloorPlan3DLevelKind) => void;
  setStaging: (visible: boolean) => void;
  setView: (kind: FloorPlan3DView) => void;
  reset: () => void;
  focusApartment: (code: string | null) => void;
  highlightApartment: (code: string | null) => void;
};

type Pose = { pos: THREE.Vector3; target: THREE.Vector3 };

const FloorPlan3D = forwardRef<FloorPlan3DHandle, FloorPlan3DProps>(function FloorPlan3D(
  { plan, levelLabel, levelKind = 'residential', onApartmentSelect, showFurniture = true },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const kindRef = useRef(levelKind);
  kindRef.current = levelKind;
  const stagingRef = useRef(showFurniture);
  stagingRef.current = showFurniture;
  const onSelectRef = useRef(onApartmentSelect);
  onSelectRef.current = onApartmentSelect;
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ---------- renderer / scene / camera ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    // r185 folds PCFSoft into PCF; softness comes from the shadow radius below.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x0d130f, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.inset = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    labelRenderer.domElement.style.zIndex = '1';
    labelRenderer.domElement.className = 'fp3d-labels';
    labelRenderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d130f);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv);
    pmrem.dispose();
    roomEnv.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.35;

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = 1.35;
    controls.enablePan = true;

    /* ---------- lights ---------- */
    const hemi = new THREE.HemisphereLight(0xdfe8ec, 0x6b5e4a, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun);
    scene.add(sun.target);

    /** Warm daylight for the residences; a cool, flatter concrete mood below grade. */
    const applyMood = (kind: FloorPlan3DLevelKind): void => {
      const parking = kind === 'parking';
      hemi.color.setHex(parking ? 0xb9c4c9 : 0xdfe8ec);
      hemi.groundColor.setHex(parking ? 0x2e302d : 0x6b5e4a);
      hemi.intensity = parking ? 0.9 : 1.0;
      sun.color.setHex(parking ? 0xf4f1ea : 0xfff1dc);
      sun.intensity = parking ? 1.2 : 2.2;
      sun.shadow.radius = parking ? 6 : 3;
      scene.environmentIntensity = parking ? 0.25 : 0.35;
    };

    const mats = createMaterials(renderer.capabilities.getMaxAnisotropy());
    const bayText = new BayTextCache(renderer.capabilities.getMaxAnisotropy());
    const waterNormal = mats.water.normalMap;

    /* ---------- camera poses + fly animation ---------- */
    let level: Level | null = null;
    let builtPlan: Plan3D | null = null;
    let builtKind: FloorPlan3DLevelKind | null = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fly: { t0: number; p0: THREE.Vector3; p1: THREE.Vector3; c0: THREE.Vector3; c1: THREE.Vector3 } | null = null;
    const tanHalfFov = Math.tan((FOV / 2) * DEG);

    const targetOf = (lv: Level): THREE.Vector3 => lv.center.clone().setY(CAM_TARGET_Y);
    /** Frame a world-space box from the current viewing direction: only the distance and target change. */
    const poseFit = (box: THREE.Box3): Pose => {
      const size = box.getSize(new THREE.Vector3());
      const target = box.getCenter(new THREE.Vector3()).setY(Math.min(CAM_TARGET_Y, size.y / 2));
      const aspect = camera.aspect || 1;
      const fit = (size.length() / 2 / Math.min(tanHalfFov, tanHalfFov * aspect)) * 1.15;
      const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, fit));
      const sph = new THREE.Spherical().setFromVector3(_v.subVectors(camera.position, controls.target));
      sph.radius = dist;
      sph.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, sph.phi));
      const pos = new THREE.Vector3().setFromSpherical(sph).add(target);
      return { pos, target };
    };
    const poseIso = (lv: Level): Pose => {
      const target = targetOf(lv);
      // south-east and above: +x, +z in world (plan south is -y, i.e. +z)
      const pos = new THREE.Vector3().setFromSphericalCoords(1.08 * lv.diag, 52 * DEG, 35 * DEG).add(target);
      return { pos, target };
    };
    const poseTop = (lv: Level): Pose => {
      const target = targetOf(lv);
      const t = Math.tan((FOV / 2) * DEG);
      const aspect = camera.aspect || 1;
      // generous margin: the stage header and view controls overlay the corners
      const fit = Math.max(lv.depth / 2 / t, lv.width / 2 / (t * aspect)) * 1.32 + CAM_TARGET_Y;
      const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, fit));
      // polar just above the controls' floor so the view reads like the sheet: plan north up
      const pos = new THREE.Vector3().setFromSphericalCoords(dist, 0.06, 0).add(target);
      return { pos, target };
    };
    const flyTo = (pose: Pose): void => {
      if (reduceMotion) {
        fly = null;
        camera.position.copy(pose.pos);
        controls.target.copy(pose.target);
        return;
      }
      fly = {
        t0: performance.now(),
        p0: camera.position.clone(),
        p1: pose.pos,
        c0: controls.target.clone(),
        c1: pose.target,
      };
    };
    const cancelFly = (): void => {
      fly = null;
    };
    controls.addEventListener('start', cancelFly);

    /* ---------- hover / selection state ---------- */
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerInside = false;
    /** Set whenever the pointer or the camera moved; the next frame re-picks once. */
    let pickDirty = false;
    /** Set whenever the camera, viewport or label state changed; the next frame re-runs the declutter. */
    let labelsDirty = false;
    let hoveredRoom = -1;
    let hoveredBay = -1;
    let hoverApt: string | null = null;
    let selectedApt: string | null = null;

    const applyHighlights = (): void => {
      if (!level) return;
      for (const r of level.rooms) {
        const sel = r.apartment !== null && r.apartment === selectedApt;
        const lit = sel || (r.apartment !== null && r.apartment === hoverApt) || r.index === hoveredRoom;
        if (r.overlay) {
          r.overlay.visible = lit;
          r.overlay.material = sel ? mats.select : mats.hover;
        }
        if (r.outline) {
          r.outline.visible = lit;
          r.outline.material = sel ? mats.selectEdge : mats.hoverEdge;
        }
        r.label?.classList.toggle('is-hover', lit);
      }
      // a residence's bays light with it; any bay names itself while hovered
      for (const b of level.bays) {
        const sel = b.code !== null && b.code === selectedApt;
        const lit = sel || (b.code !== null && b.code === hoverApt) || b.index === hoveredBay;
        b.overlay.visible = lit;
        b.overlay.material = sel ? mats.select : mats.hover;
        if (b.outline) {
          b.outline.visible = lit;
          b.outline.material = sel ? mats.selectEdge : mats.hoverEdge;
        }
        b.label.visible = lit;
        b.label.element.classList.toggle('is-hover', lit);
      }
      for (const [code, pin] of level.pins) {
        pin.classList.toggle('is-active', code === selectedApt);
        pin.classList.toggle('is-hover', code === hoverApt && code !== selectedApt);
      }
      labelRenderer.domElement.classList.toggle('has-selection', selectedApt !== null);
      labelsDirty = true; // lit labels move to the front of the declutter order
    };

    /** Results of the last pick: indexes into the level's room / bay nodes, or -1. */
    let pickedRoom = -1;
    let pickedBay = -1;

    const setHovered = (): void => {
      if (pickedRoom === hoveredRoom && pickedBay === hoveredBay) return;
      hoveredRoom = pickedRoom;
      hoveredBay = pickedBay;
      const clickable = hoveredRoom >= 0 || (hoveredBay >= 0 && level !== null && level.bays[hoveredBay].code !== null);
      dom.style.cursor = clickable ? 'pointer' : '';
      applyHighlights();
    };

    /** Nearest floor patch or bay under the pointer, into `pickedRoom` / `pickedBay`. */
    const pick = (): void => {
      pickedRoom = -1;
      pickedBay = -1;
      if (!pointerInside || !level || level.pickables.length === 0) return;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(level.pickables, false);
      if (hits.length === 0) return;
      const data = hits[0].object.userData as { room?: number; bay?: number };
      if (data.room !== undefined) pickedRoom = data.room;
      else if (data.bay !== undefined) pickedBay = data.bay;
    };

    const highlightApartment = (code: string | null): void => {
      if (code === hoverApt) return;
      hoverApt = code;
      applyHighlights();
    };

    const focusApartment = (code: string | null): void => {
      selectedApt = code;
      applyHighlights();
      if (code === null || !level) return;
      const box = level.aptBounds.get(code);
      if (box) flyTo(poseFit(box));
    };

    /** A pin or apartment room was clicked: the page owns selection when it listens, else we self-select. */
    const select = (code: string): void => {
      const cb = onSelectRef.current;
      if (cb) cb(code);
      else focusApartment(code);
    };

    const updatePointer = (e: PointerEvent): void => {
      const rect = dom.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    let down: { id: number; x: number; y: number; t: number } | null = null;
    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      updatePointer(e);
      pointerInside = true;
      pickDirty = true;
    };
    const onPointerLeave = (): void => {
      pointerInside = false;
      pickDirty = true;
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const held = performance.now() - down.t;
      down = null;
      if (moved > CLICK_SLOP_PX || held > CLICK_MAX_MS) return; // that was an orbit, not a click
      updatePointer(e);
      pointerInside = true;
      pick();
      if (e.pointerType !== 'mouse') pointerInside = false;
      if (!level) return;
      const code = pickedRoom >= 0 ? level.rooms[pickedRoom].apartment : pickedBay >= 0 ? level.bays[pickedBay].code : null;
      if (code) select(code);
    };
    const markPick = (): void => {
      pickDirty = true;
      labelsDirty = true;
    };
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerleave', onPointerLeave);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    controls.addEventListener('change', markPick);

    /* ---------- label declutter ---------- */
    /**
     * Pill sizes are read once per build: the elements are parented into the label layer ahead of the
     * renderer (which only appends what isn't there yet) so one layout serves every label. Re-run when
     * the web fonts land, since a fallback face measures differently.
     */
    const measureLabels = (lv: Level): void => {
      const host = labelRenderer.domElement;
      for (const l of lv.labels) if (l.el.parentNode !== host) host.appendChild(l.el);
      for (const l of lv.labels) {
        const w = l.el.offsetWidth;
        const h = l.el.offsetHeight;
        // a pill hidden by the renderer (a bay's, say) measures 0: keep what we had
        if (w > 0 && h > 0) {
          l.w = w;
          l.h = h;
        }
      }
      labelsDirty = true;
    };

    /* Kept-rect pool for the declutter pass — grown once, reused every frame. */
    const keptX0: number[] = [];
    const keptY0: number[] = [];
    const keptX1: number[] = [];
    const keptY1: number[] = [];
    let keptN = 0;
    const isLit = (el: HTMLElement): boolean => el.classList.contains('is-hover') || el.classList.contains('is-active');

    /**
     * Ranked screen-space declutter. Every label is projected to the viewport and, in priority order,
     * kept only where it neither collides with a higher-ranked label nor outgrows its own room on screen.
     * Two sweeps: lit labels first (never hidden), then the level's pre-sorted order.
     */
    const declutter = (lv: Level, far: boolean, veryFar: boolean): void => {
      const list = lv.labels;
      keptN = 0;
      for (let sweep = 0; sweep < 2; sweep++) {
        for (let i = 0; i < list.length; i++) {
          const l = list[i];
          const lit = isLit(l.el);
          if ((sweep === 0) !== lit) continue;
          let occluded = false;
          let toobig = false;
          // labels the tiers or their own state already hide claim no space
          const shown =
            lit ||
            (l.obj.visible &&
              !l.parkingPin &&
              !(veryFar && !l.pinned) &&
              !(far && l.minor && !l.pinned) &&
              l.w > 0);
          // behind the camera the renderer hides it anyway
          if (shown && (_v.setFromMatrixPosition(l.obj.matrixWorld).project(camera).z < -1 || _v.z > 1)) continue;
          if (shown) {
            const sx = (_v.x + 1) * 0.5 * viewW;
            const sy = (1 - _v.y) * 0.5 * viewH;
            if (!lit && l.corners) {
              // fit-in-room: the ring bbox's projected extent must hold the pill
              let px0 = Infinity;
              let py0 = Infinity;
              let px1 = -Infinity;
              let py1 = -Infinity;
              for (let k = 0; k < 4; k++) {
                _v.copy(l.corners[k]).project(camera);
                const cx = (_v.x + 1) * 0.5 * viewW;
                const cy = (1 - _v.y) * 0.5 * viewH;
                if (cx < px0) px0 = cx;
                if (cx > px1) px1 = cx;
                if (cy < py0) py0 = cy;
                if (cy > py1) py1 = cy;
              }
              toobig = l.w > LABEL_FIT_SHARE * (px1 - px0) || l.h > py1 - py0;
            }
            if (!toobig) {
              const x0 = sx - l.w / 2 - LABEL_GAP_PX;
              const y0 = sy - l.h / 2 - LABEL_GAP_PX;
              const x1 = sx + l.w / 2 + LABEL_GAP_PX;
              const y1 = sy + l.h / 2 + LABEL_GAP_PX;
              // a lit label keeps whatever row it had so it doesn't jump under the pointer
              let nudge = lit ? l.nudge : 0;
              if (!lit) {
                // a landmark (pool, car park, reception) that meets an equal steps one row down,
                // then up, before it gives way — two lakes on a map both keep their names
                const step = l.pinned && l.priority === PRIORITY_KEY ? l.h + 2 * LABEL_GAP_PX + 2 : 0;
                const tries = step > 0 ? 3 : 1;
                for (let t = 0; t < tries; t++) {
                  nudge = t === 0 ? 0 : t === 1 ? step : -step;
                  occluded = false;
                  for (let k = 0; k < keptN; k++) {
                    if (x0 < keptX1[k] && x1 > keptX0[k] && y0 + nudge < keptY1[k] && y1 + nudge > keptY0[k]) {
                      occluded = true;
                      break;
                    }
                  }
                  if (!occluded) break;
                }
                if (occluded) nudge = 0;
              }
              if (!occluded) {
                keptX0[keptN] = x0;
                keptY0[keptN] = y0 + nudge;
                keptX1[keptN] = x1;
                keptY1[keptN] = y1 + nudge;
                keptN++;
              }
              if (nudge !== l.nudge) {
                l.nudge = nudge;
                // CSS2DRenderer owns `transform`; the margin rides along with it untouched
                l.el.style.marginTop = nudge === 0 ? '' : `${nudge}px`;
              }
            }
          }
          if (occluded !== l.occluded) {
            l.occluded = occluded;
            l.el.classList.toggle('is-occluded', occluded);
          }
          if (toobig !== l.toobig) {
            l.toobig = toobig;
            l.el.classList.toggle('is-toobig', toobig);
          }
        }
      }
    };

    /* ---------- level lifecycle ---------- */
    const frameLevel = (lv: Level): void => {
      const s = Math.max(1, lv.diag / 50);
      sun.position.set(lv.center.x - 20 * s, 35 * s, lv.center.z + 18 * s);
      sun.target.position.copy(lv.center);
      const half = lv.diag * 0.55 + 2;
      const cam = sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 0.5;
      cam.far = sun.position.distanceTo(lv.center) + lv.diag + 5;
      cam.updateProjectionMatrix();
      controls.maxDistance = 3 * lv.diag;
      camera.far = lv.diag * 12 + 100;
      camera.updateProjectionMatrix();
    };

    const setPlan = (next: Plan3D, kind: FloorPlan3DLevelKind): void => {
      if (next === builtPlan && kind === builtKind) return;
      const first = level === null;
      if (level) disposeLevel(level);
      applyMood(kind);
      level = buildLevel(next, mats, { onPinClick: select, onPinHover: highlightApartment }, kind === 'parking', stagingRef.current, bayText);
      builtPlan = next;
      builtKind = kind;
      scene.add(level.group);
      frameLevel(level);
      measureLabels(level);
      // the pointer's room index means nothing on a new floor, and a selection only survives if
      // the new sheet carries that code (the page clears its own copy on a level change)
      hoveredRoom = -1;
      hoveredBay = -1;
      if (selectedApt !== null && !level.aptBounds.has(selectedApt)) selectedApt = null;
      dom.style.cursor = '';
      pickDirty = true;
      applyHighlights();
      const pose = poseIso(level);
      if (first) {
        camera.position.copy(pose.pos);
        controls.target.copy(pose.target);
        controls.update();
      } else {
        flyTo(pose);
      }
    };

    const setView = (kind: FloorPlan3DView): void => {
      if (!level) return;
      flyTo(kind === 'top' ? poseTop(level) : poseIso(level));
    };

    const setStaging = (visible: boolean): void => {
      if (level) level.staging.visible = visible;
    };

    /* ---------- resize ---------- */
    let viewW = 1;
    let viewH = 1;
    const resize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      viewW = w;
      viewH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      labelsDirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* ---------- frame loop ---------- */
    let raf = 0;
    let labelsFar = false;
    let labelsVeryFar = false;
    let lastDeclutter = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      if (fly) {
        const t = Math.min((performance.now() - fly.t0) / FLY_MS, 1);
        const s = 1 - Math.pow(1 - t, 3); // ease-out cubic
        camera.position.lerpVectors(fly.p0, fly.p1, s);
        controls.target.lerpVectors(fly.c0, fly.c1, s);
        if (t >= 1) fly = null;
        pickDirty = true;
        labelsDirty = true;
      }
      controls.update();
      // Hover picking is throttled to one raycast per frame, and only when something moved.
      if (pickDirty) {
        pickDirty = false;
        pick();
        setHovered();
      }
      // Water shimmer: only the shared normal map's offset moves — no allocations.
      if (waterNormal) {
        const t = performance.now() * 0.001;
        waterNormal.offset.set((t * 0.018) % 1, (t * 0.011) % 1);
      }
      // Label density: screen pixels per metre at the orbit target.
      const pxPerM = viewH / (2 * camera.position.distanceTo(controls.target) * tanHalfFov);
      const far = pxPerM < LABEL_MINOR_MIN_PX_PER_M;
      if (far !== labelsFar) {
        labelsFar = far;
        labelRenderer.domElement.classList.toggle('is-far', far);
      }
      const veryFar = pxPerM < LABEL_MIN_PX_PER_M;
      if (veryFar !== labelsVeryFar) {
        labelsVeryFar = veryFar;
        labelRenderer.domElement.classList.toggle('is-veryfar', veryFar);
        labelsDirty = true;
      }
      if (far !== labelsFar) {
        labelsFar = far;
        labelsDirty = true;
      }
      renderer.render(scene, camera);
      // The declutter reads the matrices the render just refreshed; idle, it still settles every 120 ms.
      const now = performance.now();
      if (level && (labelsDirty || now - lastDeclutter > DECLUTTER_IDLE_MS)) {
        labelsDirty = false;
        lastDeclutter = now;
        declutter(level, far, veryFar);
      }
      labelRenderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);
    // web fonts arriving after the build change every pill's width
    const fontsReady = typeof document.fonts?.ready?.then === 'function' ? document.fonts.ready : null;
    void fontsReady?.then(() => {
      if (!disposed && level) measureLabels(level);
    });

    /* ---------- teardown (StrictMode-proof) ---------- */
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerleave', onPointerLeave);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      controls.removeEventListener('change', markPick);
      controls.removeEventListener('start', cancelFly);
      controls.dispose();
      if (level) disposeLevel(level);
      level = null;
      scene.clear();
      disposeMaterials(mats);
      bayText.dispose();
      sun.dispose();
      envRT.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    };

    apiRef.current = { setPlan, setStaging, setView, reset: () => setView('iso'), focusApartment, highlightApartment };
    setPlan(planRef.current, kindRef.current);

    return () => {
      apiRef.current = null;
      dispose();
    };
  }, []);

  useEffect(() => {
    apiRef.current?.setPlan(plan, levelKind);
  }, [plan, levelKind]);

  useEffect(() => {
    apiRef.current?.setStaging(showFurniture);
  }, [showFurniture]);

  useImperativeHandle(
    ref,
    () => ({
      setView: (kind) => apiRef.current?.setView(kind),
      reset: () => apiRef.current?.reset(),
      focusApartment: (code) => apiRef.current?.focusApartment(code),
      highlightApartment: (code) => apiRef.current?.highlightApartment(code),
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${levelLabel} — interactive 3D floor-plan model`}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab' }}
    />
  );
});

export default FloorPlan3D;
