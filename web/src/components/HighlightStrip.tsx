import { BUILDING_HIGHLIGHTS } from '../data/building';
import { IconShield, IconLeaf, IconCar, IconElevator, IconConcierge } from './Icons';

const ICONS = {
  shield: IconShield,
  leaf: IconLeaf,
  car: IconCar,
  elevator: IconElevator,
  concierge: IconConcierge,
};

export default function HighlightStrip() {
  return (
    <div className="highlight-strip">
      {BUILDING_HIGHLIGHTS.map((h) => {
        const Icon = ICONS[h.icon as keyof typeof ICONS];
        return (
          <div key={h.title} className="highlight-strip-item">
            <span className="highlight-strip-icon">
              <Icon size={18} />
            </span>
            <div>
              <strong>{h.title}</strong>
              <span>{h.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
