import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BuildingModel3D from '../components/BuildingModel3D';
import type { BlockId, FloorId, UnitRecord } from '../data/buildingExplorer';
import {
  BASEMENT_FLOORS,
  BLOCK_INFO,
  LEVELS_LABEL,
  RESIDENTIAL_FLOORS,
  TOTAL_BLOCKS,
  TOTAL_UNITS,
  UNIT_KIND_LABEL,
  floorLabel,
  unitsOnFloor,
} from '../data/buildingExplorer';
import { planIdForFloor } from '../data/floorPlans';
import { formatSqm, levelSpanShort, useResidenceAreas } from '../data/planAreas';
import {
  IconArrowRight,
  IconBuilding,
  IconCar,
  IconHome,
  IconLayers,
  IconLeaf,
} from '../components/Icons';
import '../styles/explorer.css';

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

export default function Explorer() {
  const [selectedBlock, setSelectedBlock] = useState<BlockId>('A');
  const [selectedFloor, setSelectedFloor] = useState<FloorId>(3);

  const blockInfo = BLOCK_INFO.find((b) => b.id === selectedBlock) ?? BLOCK_INFO[0];

  const isResidential = typeof selectedFloor === 'number';
  const isBasement = selectedFloor === 'b1' || selectedFloor === 'b2' || selectedFloor === 'b3';

  const floorUnits = useMemo(
    () => (typeof selectedFloor === 'number' ? unitsOnFloor(selectedBlock, selectedFloor) : []),
    [selectedBlock, selectedFloor],
  );

  /** Other floors spanned by units on the selected floor — highlights the duplex partner pill. */
  const partnerFloors = useMemo(() => {
    const partners = new Set<number>();
    if (typeof selectedFloor !== 'number') return partners;
    for (const unit of floorUnits) {
      for (const f of unit.floors) {
        if (f !== selectedFloor) partners.add(f);
      }
    }
    return partners;
  }, [floorUnits, selectedFloor]);

  /** The plan sheet the residence rows open — the selected floor, which every listed residence occupies. */
  const levelId = typeof selectedFloor === 'number' ? planIdForFloor(selectedFloor) : null;

  // Measured areas for the listed residences, from the as-built plan models (one fetch per sheet).
  const areas = useResidenceAreas(floorUnits);
  const measuredCount = floorUnits.filter((u) => areas.byCode.get(u.apartment)?.complete).length;
  const areaNote =
    areas.status !== 'ready' || floorUnits.length === 0
      ? null
      : measuredCount === floorUnits.length
        ? 'Areas are net internal, measured from the as-built plans.'
        : measuredCount > 0
          ? 'Areas shown are net internal, measured from the as-built plans; the remaining residences are still being outlined.'
          : 'These residences are still being outlined from the as-built plans; net internal areas follow once every room is enclosed.';

  return (
    <div className="explorer-page">
      <div className="container">
        <nav className="explorer-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <span>Explorer</span>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <span className="current">Block &amp; Floor Selection</span>
        </nav>

        <div className="explorer-head">
          <div>
            <h1>Block &amp; Floor Selection</h1>
            <p className="explorer-sub">
              Choose a block and floor to explore Garden View&rsquo;s forty-one residences.
            </p>
          </div>
          <div className="explorer-stats">
            <div className="explorer-stat">
              <IconBuilding size={20} />
              <div>
                <strong>{TOTAL_BLOCKS}</strong>
                <span>Blocks</span>
              </div>
            </div>
            <div className="explorer-stat">
              <IconLayers size={20} />
              <div>
                <strong>{LEVELS_LABEL}</strong>
                <span>Levels</span>
              </div>
            </div>
            <div className="explorer-stat">
              <IconHome size={20} />
              <div>
                <strong>{TOTAL_UNITS}</strong>
                <span>Residences</span>
              </div>
            </div>
          </div>
        </div>

        <div className="explorer-grid">
          {/* 1 · Select Block */}
          <div className="explorer-col explorer-col-blocks">
            <p className="explorer-step-label">1 · Select Block</p>
            <div className="explorer-block-cards">
              {BLOCK_INFO.map((block) => {
                const isSelected = block.id === selectedBlock;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={`explorer-block-card${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedBlock(block.id)}
                  >
                    <span className="explorer-block-thumb-wrap">
                      <img className="explorer-block-thumb" src={block.image} alt="" />
                    </span>
                    <span className="explorer-block-card-body">
                      <span className="explorer-block-name">{block.name}</span>
                      <span className="explorer-block-meta">
                        {block.unitCount} residences · {block.perLevel}
                      </span>
                    </span>
                    {isSelected && <span className="explorer-block-chip">Selected</span>}
                  </button>
                );
              })}
            </div>

            <div className="explorer-block-overview">
              <p className="explorer-overview-title">Block {selectedBlock} Overview</p>
              <div className="explorer-fact">
                <IconHome size={14} />
                <span>{blockInfo.unitCount} residences</span>
              </div>
              <div className="explorer-fact">
                <IconLayers size={14} />
                <span>Levels G–10</span>
              </div>
              <div className="explorer-fact">
                <IconLeaf size={14} />
                <span>{blockInfo.layout}</span>
              </div>
            </div>
          </div>

          {/* 3D viewer */}
          <div className="explorer-col explorer-col-viewer">
            <div className="explorer-viewer">
              <BuildingModel3D
                selectedBlock={selectedBlock}
                selectedFloor={selectedFloor}
                onSelectBlock={setSelectedBlock}
              />
              <div className="explorer-viewer-card">
                <p className="explorer-viewer-name">{blockInfo.name}</p>
                <p className="explorer-viewer-meta">{blockInfo.unitCount} residences · Levels G–10</p>
              </div>
              <p className="explorer-viewer-hint">Drag to orbit · Scroll to zoom</p>
            </div>
          </div>

          {/* 2 · Select Floor */}
          <div className="explorer-col explorer-col-floors">
            <p className="explorer-step-label">2 · Select Floor</p>
            <div className="explorer-floor-rail">
              <button
                type="button"
                className={`explorer-floor-pill is-roof${selectedFloor === 'roof' ? ' is-selected' : ''}`}
                aria-pressed={selectedFloor === 'roof'}
                onClick={() => setSelectedFloor('roof')}
              >
                Roof
              </button>
              {RESIDENTIAL_FLOORS.map((floor) => {
                const isSelected = selectedFloor === floor;
                const isPartner = partnerFloors.has(floor);
                return (
                  <button
                    key={floor}
                    type="button"
                    className={`explorer-floor-pill${isSelected ? ' is-selected' : ''}${
                      isPartner ? ' is-partner' : ''
                    }`}
                    aria-pressed={isSelected}
                    aria-label={floorLabel(floor)}
                    onClick={() => setSelectedFloor(floor)}
                  >
                    {floor === 0 ? 'G' : floor}
                  </button>
                );
              })}
              <div className="explorer-floor-divider" aria-hidden="true" />
              {BASEMENT_FLOORS.map((basement) => {
                const isSelected = selectedFloor === basement.id;
                return (
                  <button
                    key={basement.label}
                    type="button"
                    className={`explorer-floor-pill is-basement${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`Basement ${basement.label}`}
                    onClick={() => setSelectedFloor(basement.id)}
                  >
                    {basement.label}
                  </button>
                );
              })}

              {/* the bracket itself spans the floors, so the short labels stay within it */}
              <div className="explorer-floor-range explorer-range-penthouse" aria-hidden="true">
                <span>Penthouse</span>
              </div>
              <div className="explorer-floor-range explorer-range-residences" aria-hidden="true">
                <span>Residences 2–8</span>
              </div>
              <div className="explorer-floor-range explorer-range-garden" aria-hidden="true">
                <span>Duplex G–1</span>
              </div>
              <div className="explorer-floor-range explorer-range-parking" aria-hidden="true">
                <span>Parking</span>
              </div>
            </div>
          </div>

          {/* 3 · Residences */}
          <div className="explorer-col explorer-col-units">
            <p className="explorer-step-label">3 · Residences</p>
            <div className="explorer-units">
              {/* keyed so switching block/floor re-runs the fade-up on the swapping region */}
              <div
                key={selectedBlock + '-' + String(selectedFloor)}
                className="explorer-units-content"
              >
                {isResidential && (
                  <>
                    <h2 className="explorer-units-title">
                      Block {selectedBlock} · {floorLabel(selectedFloor)}
                    </h2>
                    <p className="explorer-units-count">
                      {floorUnits.length} {floorUnits.length === 1 ? 'residence' : 'residences'} on
                      this level
                    </p>
                    <ul className="explorer-unit-list">
                      {floorUnits.map((unit) => {
                        const area = areas.byCode.get(unit.apartment);
                        const measured = area?.complete === true && area.netSqm !== undefined;
                        return (
                          <li key={unit.apartment}>
                            <Link
                              className="explorer-unit-row"
                              to={`/floor-plans?level=${levelId ?? 'g'}&unit=${encodeURIComponent(unit.apartment)}`}
                              aria-label={`Open the floor plan of Residence ${unit.apartment}`}
                            >
                              <span className="explorer-unit-main">
                                <span className="explorer-unit-number">{unit.apartment}</span>
                                <span className="explorer-unit-kind">{unitSubLabel(unit)}</span>
                                {measured && area && (
                                  <span className="explorer-unit-area">
                                    <strong>{formatSqm(area.netSqm as number)}</strong> net
                                    {area.levels.length > 1 && ` across ${levelSpanShort(area.levels)}`}
                                  </span>
                                )}
                              </span>
                              <span className="explorer-unit-stack">{unit.stack}</span>
                              <span className="explorer-unit-arrow" aria-hidden="true">
                                <IconArrowRight size={13} />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    {areaNote && <div className="note-card">{areaNote}</div>}
                  </>
                )}

                {selectedFloor === 'roof' && (
                  <div className="explorer-empty">
                    <span className="explorer-empty-icon">
                      <IconLeaf size={20} />
                    </span>
                    <p className="explorer-empty-title">Roof level</p>
                    <p className="explorer-empty-line">
                      Set-back rooftop with planted terraces above the penthouse duplexes.
                    </p>
                  </div>
                )}

                {isBasement && (
                  <div className="explorer-empty">
                    <span className="explorer-empty-icon">
                      <IconCar size={20} />
                    </span>
                    <p className="explorer-empty-title">Parking &amp; services</p>
                    <p className="explorer-empty-line">
                      Levels B1–B3 hold resident parking and building services.
                    </p>
                  </div>
                )}
              </div>

              <div className="explorer-units-footer">
                <Link
                  to={`/floor-plans?level=${planIdForFloor(selectedFloor === 'roof' ? 10 : selectedFloor)}`}
                  className="btn btn-gold btn-block"
                >
                  View Floor Plans <IconArrowRight size={13} />
                </Link>
                <Link to="/location" className="btn btn-outline-gold btn-block">
                  Ask About A Residence
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
