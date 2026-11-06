import { BLOCKS, BUILDING_FACTS } from '../data/building';

type BuildingElevationProps = {
  /** "A" | "B" | "C" — the resident's block */
  block: string;
  /** the residence's floors, 0 (ground) to 10; a duplex has two */
  floors: number[];
  /** short label for the lit floors, e.g. "3 A1" */
  label: string;
};

// A front elevation of Garden View: the three blocks side by side, each as wide as its share of
// the 41 residences (18 / 6 / 17), stacked ground to level 10. The resident's floors are drawn
// in gold, so the home page shows where their home sits in the building.
const W = 320;
const LEVELS = BUILDING_FACTS.levels; // G + 10
const FLOOR_H = 14;
const GAP = 3;
const TOP = 10;
const GROUND = TOP + LEVELS * FLOOR_H + 2;
const BLOCK_GAP = 6;

export default function BuildingElevation({ block, floors, label }: BuildingElevationProps) {
  const total = BLOCKS.reduce((sum, b) => sum + b.units, 0);
  const usable = W - BLOCK_GAP * (BLOCKS.length - 1);
  let x = 0;
  const blocks = BLOCKS.map((b) => {
    const id = b.name.replace('Block ', '');
    const width = (usable * b.units) / total;
    const shape = { id, x, width, units: b.units };
    x += width + BLOCK_GAP;
    return shape;
  });
  const lit = new Set(floors);

  return (
    <figure className="rs-elev">
      <svg viewBox={`-2 0 ${W + 4} ${GROUND + 26}`} role="img" aria-label={`Garden View, with residence ${label} lit on block ${block}`}>
        {blocks.map((b) => (
          <g key={b.id}>
            {Array.from({ length: LEVELS }, (_, level) => {
              const y = TOP + (LEVELS - 1 - level) * FLOOR_H;
              const isMine = b.id === block && lit.has(level);
              return (
                <rect
                  key={level}
                  x={b.x}
                  y={y + GAP / 2}
                  width={b.width}
                  height={FLOOR_H - GAP}
                  rx={1.5}
                  className={isMine ? 'rs-elev-mine' : b.id === block ? 'rs-elev-block' : 'rs-elev-floor'}
                />
              );
            })}
            <text x={b.x + b.width / 2} y={GROUND + 16} className="rs-elev-letter" textAnchor="middle">
              {b.id}
            </text>
          </g>
        ))}
        <line x1={-2} x2={W + 2} y1={GROUND} y2={GROUND} className="rs-elev-ground" />
      </svg>
      <figcaption>
        <strong>{label}</strong>
        <span>
          Block {block} · {floors.length > 1 ? 'Levels' : 'Level'} {floors.map((f) => (f === 0 ? 'G' : f)).join(' & ')}
        </span>
      </figcaption>
    </figure>
  );
}
