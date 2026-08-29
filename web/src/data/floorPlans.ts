// The as-built architectural plan set for Garden View, one sheet per level, as
// received from building management (AutoCAD DWG, as-built survey 2010). `src` is
// the web-ready SVG once a sheet has been converted; null until then.

export type PlanLevelId = 'b3' | 'b2' | 'b1' | 'g' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export type PlanLevel = {
  id: PlanLevelId;
  /** Full label, e.g. "Level 3", "Ground Floor", "Basement 2". */
  label: string;
  /** Rail label, e.g. "3", "G", "B2". */
  short: string;
  kind: 'parking' | 'residential';
  /** Residential floor number for cross-referencing the unit registry; undefined for basements. */
  floor?: number;
  /** Drawing sheet number from the as-built set. */
  sheet: string;
  sourceFile: string;
  src: string | null;
};

export const PLAN_LEVELS: PlanLevel[] = [
  { id: '10', label: 'Level 10', short: '10', kind: 'residential', floor: 10, sheet: 'A114', sourceFile: 'A114-Floor10.dwg', src: '/plans/level-10.svg' },
  { id: '9', label: 'Level 9', short: '9', kind: 'residential', floor: 9, sheet: 'A113', sourceFile: 'A113-Floor9.dwg', src: '/plans/level-9.svg' },
  { id: '8', label: 'Level 8', short: '8', kind: 'residential', floor: 8, sheet: 'A112', sourceFile: 'A112-Floor8.dwg', src: '/plans/level-8.svg' },
  { id: '7', label: 'Level 7', short: '7', kind: 'residential', floor: 7, sheet: 'A209', sourceFile: 'A209-Floor7.dwg', src: '/plans/level-7.svg' },
  { id: '6', label: 'Level 6', short: '6', kind: 'residential', floor: 6, sheet: 'A108', sourceFile: 'A108-Floor6.dwg', src: '/plans/level-6.svg' },
  { id: '5', label: 'Level 5', short: '5', kind: 'residential', floor: 5, sheet: 'A109', sourceFile: 'A109-Floor5.dwg', src: '/plans/level-5.svg' },
  { id: '4', label: 'Level 4', short: '4', kind: 'residential', floor: 4, sheet: 'A108', sourceFile: 'A108-Floor4.dwg', src: '/plans/level-4.svg' },
  { id: '3', label: 'Level 3', short: '3', kind: 'residential', floor: 3, sheet: 'A107', sourceFile: 'A107-Floor3.dwg', src: '/plans/level-3.svg' },
  { id: '2', label: 'Level 2', short: '2', kind: 'residential', floor: 2, sheet: 'A106', sourceFile: 'A106-Floor2.dwg', src: '/plans/level-2.svg' },
  { id: '1', label: 'Level 1', short: '1', kind: 'residential', floor: 1, sheet: 'A105', sourceFile: 'A105-floor1.dwg', src: '/plans/level-1.svg' },
  { id: 'g', label: 'Ground Floor', short: 'G', kind: 'residential', floor: 0, sheet: 'A104', sourceFile: 'A104-Ground floor.dwg', src: '/plans/level-g.svg' },
  { id: 'b1', label: 'Basement 1', short: 'B1', kind: 'parking', sheet: 'A103', sourceFile: 'A103-BASEMENT-1.dwg', src: '/plans/level-b1.svg' },
  { id: 'b2', label: 'Basement 2', short: 'B2', kind: 'parking', sheet: 'A102', sourceFile: 'A102-BASEMENT-2.dwg', src: '/plans/level-b2.svg' },
  { id: 'b3', label: 'Basement 3', short: 'B3', kind: 'parking', sheet: 'A101', sourceFile: 'A101-BASEMENT-3.dwg', src: '/plans/level-b3.svg' },
];

export function planLevelById(id: string | null | undefined): PlanLevel | undefined {
  return PLAN_LEVELS.find((l) => l.id === id);
}

/** Map an explorer floor (0..10 number, or a basement id) to a plan level id. */
export function planIdForFloor(floor: number | 'b1' | 'b2' | 'b3'): PlanLevelId {
  if (typeof floor !== 'number') return floor;
  return floor === 0 ? 'g' : (String(floor) as PlanLevelId);
}
