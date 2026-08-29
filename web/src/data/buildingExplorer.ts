// Real building structure for the 3D explorer, derived from the registered owner
// directory (unit numbers only — no owner data belongs in this file, ever).
//
// Numbering scheme, as registered: "<floor(s)> <Block><stack>" — "3 A1" is floor 3,
// Block A, stack 1. A slashed prefix marks a duplex spanning both floors: "0/1" is a
// ground+first garden duplex, "9/10" a penthouse duplex. Blocks A and C carry two
// stacks per level; Block B is one full-floor residence per level, mostly duplexes.

export type BlockId = 'A' | 'B' | 'C';

/** Residential floors are 0 (ground) through 10. The rail also shows roof + basements. */
export type FloorId = number | 'roof' | 'b1' | 'b2' | 'b3';

export type UnitRecord = {
  /** Apartment number exactly as registered, e.g. "3 A1", "9/10 B". */
  apartment: string;
  block: BlockId;
  /** Vertical stack within the block: A1/A2, B, C1/C2. */
  stack: string;
  /** Floors this residence occupies, e.g. [3] or [9, 10]. */
  floors: number[];
  kind: 'simplex' | 'full-floor' | 'garden-duplex' | 'duplex' | 'penthouse-duplex';
};

const A = (apartment: string, stack: string, floors: number[], kind: UnitRecord['kind']): UnitRecord => ({
  apartment,
  block: 'A',
  stack,
  floors,
  kind,
});
const B = (apartment: string, floors: number[], kind: UnitRecord['kind']): UnitRecord => ({
  apartment,
  block: 'B',
  stack: 'B',
  floors,
  kind,
});
const C = (apartment: string, stack: string, floors: number[], kind: UnitRecord['kind']): UnitRecord => ({
  apartment,
  block: 'C',
  stack,
  floors,
  kind,
});

/** All 41 registered residences. A=18, B=6, C=17. */
export const UNITS: UnitRecord[] = [
  // Block A — two stacks, garden duplexes at G–1, penthouse duplexes at 9–10.
  A('0/1 A1', 'A1', [0, 1], 'garden-duplex'),
  A('0/1 A2', 'A2', [0, 1], 'garden-duplex'),
  A('2 A1', 'A1', [2], 'simplex'),
  A('2 A2', 'A2', [2], 'simplex'),
  A('3 A1', 'A1', [3], 'simplex'),
  A('3 A2', 'A2', [3], 'simplex'),
  A('4 A1', 'A1', [4], 'simplex'),
  A('4 A2', 'A2', [4], 'simplex'),
  A('5 A1', 'A1', [5], 'simplex'),
  A('5 A2', 'A2', [5], 'simplex'),
  A('6 A1', 'A1', [6], 'simplex'),
  A('6 A2', 'A2', [6], 'simplex'),
  A('7 A1', 'A1', [7], 'simplex'),
  A('7 A2', 'A2', [7], 'simplex'),
  A('8 A1', 'A1', [8], 'simplex'),
  A('8 A2', 'A2', [8], 'simplex'),
  A('9/10 A1', 'A1', [9, 10], 'penthouse-duplex'),
  A('9/10 A2', 'A2', [9, 10], 'penthouse-duplex'),
  // Block B — one full-floor residence per level, mostly duplex.
  B('0/1 B', [0, 1], 'garden-duplex'),
  B('2 B', [2], 'full-floor'),
  B('3/4 B', [3, 4], 'duplex'),
  B('5/6 B', [5, 6], 'duplex'),
  B('7/8 B', [7, 8], 'duplex'),
  B('9/10 B', [9, 10], 'penthouse-duplex'),
  // Block C — two stacks, but a single garden duplex at G–1 (there is no 0/1 C2).
  C('0/1 C1', 'C1', [0, 1], 'garden-duplex'),
  C('2 C1', 'C1', [2], 'simplex'),
  C('2 C2', 'C2', [2], 'simplex'),
  C('3 C1', 'C1', [3], 'simplex'),
  C('3 C2', 'C2', [3], 'simplex'),
  C('4 C1', 'C1', [4], 'simplex'),
  C('4 C2', 'C2', [4], 'simplex'),
  C('5 C1', 'C1', [5], 'simplex'),
  C('5 C2', 'C2', [5], 'simplex'),
  C('6 C1', 'C1', [6], 'simplex'),
  C('6 C2', 'C2', [6], 'simplex'),
  C('7 C1', 'C1', [7], 'simplex'),
  C('7 C2', 'C2', [7], 'simplex'),
  C('8 C1', 'C1', [8], 'simplex'),
  C('8 C2', 'C2', [8], 'simplex'),
  C('9/10 C1', 'C1', [9, 10], 'penthouse-duplex'),
  C('9/10 C2', 'C2', [9, 10], 'penthouse-duplex'),
];

export const UNIT_KIND_LABEL: Record<UnitRecord['kind'], string> = {
  simplex: 'Single level',
  'full-floor': 'Full floor',
  'garden-duplex': 'Duplex · Ground–1',
  duplex: 'Duplex',
  'penthouse-duplex': 'Penthouse duplex · 9–10',
};

export type BlockInfo = {
  id: BlockId;
  name: string;
  unitCount: number;
  stacks: number;
  image: string;
  /** Short per-level phrasing for the block card — must stay true for every floor. */
  perLevel: string;
  /** One-line real description of how the block is organized. */
  layout: string;
};

export const BLOCK_INFO: BlockInfo[] = [
  {
    id: 'A',
    name: 'Block A',
    unitCount: 18,
    stacks: 2,
    image: '/images/exterior-04.jpg',
    perLevel: '2 per level',
    layout: 'Two residences per level · ground-floor duplexes, penthouse duplexes at 9–10',
  },
  {
    id: 'B',
    name: 'Block B',
    unitCount: 6,
    stacks: 1,
    image: '/images/exterior-10.jpg',
    perLevel: 'full-floor',
    layout: 'One full-floor residence per level, most spanning two floors',
  },
  {
    id: 'C',
    name: 'Block C',
    unitCount: 17,
    stacks: 2,
    image: '/images/exterior-03.jpg',
    // ground/level 1 hold a single garden duplex, so "2 per level" would be false there
    perLevel: 'up to 2 per level',
    layout: 'Two residences per level · a single ground-floor duplex, penthouse duplexes at 9–10',
  },
];

/** Residential floors, top first, as shown on the floor rail. */
export const RESIDENTIAL_FLOORS: number[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

export const BASEMENT_FLOORS: Array<{ id: FloorId; label: string }> = [
  { id: 'b1', label: 'B1' },
  { id: 'b2', label: 'B2' },
  { id: 'b3', label: 'B3' },
];

export const TOTAL_UNITS = UNITS.length; // 41
export const TOTAL_BLOCKS = 3;
/** Ground + floors 1–10. */
export const LEVELS_LABEL = 'G+10';

export function floorLabel(floor: FloorId): string {
  if (floor === 'roof') return 'Roof';
  if (floor === 'b1' || floor === 'b2' || floor === 'b3') return floor.toUpperCase();
  if (floor === 0) return 'Ground';
  return `Level ${floor}`;
}

/** Units in a block that occupy the given residential floor (duplexes appear on both of their floors). */
export function unitsOnFloor(block: BlockId, floor: number): UnitRecord[] {
  return UNITS.filter((u) => u.block === block && u.floors.includes(floor));
}

export function unitsInBlock(block: BlockId): UnitRecord[] {
  return UNITS.filter((u) => u.block === block);
}
