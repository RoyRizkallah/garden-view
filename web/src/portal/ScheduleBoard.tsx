import type { CSSProperties, Ref } from 'react';
import { clockLabel, isOnDuty, type Bar, type BoardSection } from './shifts';

const DAY = 24 * 60;
const TICK_EVERY = 3 * 60;

/** the colour of a bar follows the time it starts: morning, afternoon, night */
function dayPart(start: number): string {
  if (start >= 5 * 60 && start < 12 * 60) return 'is-morning';
  if (start >= 12 * 60 && start < 18 * 60) return 'is-afternoon';
  return 'is-night';
}

function BarView({ bar, now }: { bar: Bar; now: number }) {
  const onDuty = isOnDuty(bar.hours, now);
  const names = bar.names.join(' · ');
  // a hairline of space between back-to-back shifts, so a handover reads as two bars
  const style = { left: `${bar.from * 100}%`, width: `calc(${bar.width * 100}% - 3px)` } as CSSProperties;
  return (
    <div
      className={`sc-bar ${dayPart(bar.shift.start)}${onDuty ? ' is-on' : ''}`}
      style={style}
      title={`${names} · ${bar.hours}${onDuty ? ' · on duty now' : ''}`}
    >
      <strong>
        {bar.names.map((name, index) => {
          const [first, ...rest] = name.split(' ');
          return (
            <span key={index} className="sc-name">
              {index > 0 && ' · '}
              {first}
              {rest.length > 0 && <span className="sc-rest"> {rest.join(' ')}</span>}
            </span>
          );
        })}
      </strong>
      <span className="sc-hours">
{bar.hours.replace(/^.*?·\s*/, '')}</span>
    </div>
  );
}

/**
 * Who works when, across one day in Beirut time: a row per post or team, a bar per shift, and a
 * line at the time now. Bars on duty now are lit.
 */
export default function ScheduleBoard({
  sections,
  startsAt,
  now,
  onDutyCount,
  height,
  boardRef,
}: {
  sections: BoardSection[];
  startsAt: number;
  now: number;
  onDutyCount: number;
  height?: number;
  boardRef?: Ref<HTMLDivElement>;
}) {
  const ticks = Array.from({ length: DAY / TICK_EVERY + 1 }, (_, index) => startsAt + index * TICK_EVERY);
  const nowAt = ((now - startsAt + DAY) % DAY) / DAY;

  return (
    <div className={`sc-board${height ? ' is-fitted' : ''}`} ref={boardRef} style={height ? { height } : undefined}>
      <header className="sc-head">
        <div>
          <p className="sc-kicker">Shifts</p>
          <h2>Who is on, and when</h2>
        </div>
        <p className="sc-now-chip">
          <span className="sc-dot" aria-hidden="true" />
          {onDutyCount} on duty now · {clockLabel(now)} in Beirut
        </p>
      </header>

      <div className="sc-body" style={{ '--sc-now': nowAt } as CSSProperties}>
        <div className="sc-axis" aria-hidden="true">
          <span className="sc-label" />
          <div className="sc-track">
            {ticks.map((tick, index) => (
              <span key={index} style={{ left: `${(index * TICK_EVERY * 100) / DAY}%` }}>
                {clockLabel(tick)}
              </span>
            ))}
          </div>
        </div>

        <div className="sc-rows">
          {sections.map((section) => (
            <div key={section.title} className="sc-section" style={{ flexGrow: section.rows.reduce((sum, row) => sum + Math.max(1, row.lanes.length), 0) }}>
              {section.rows.length > 1 && <p className="sc-section-title">{section.title}</p>}
              {section.rows.map((row) => (
                <div key={row.label || section.title} className="sc-row" style={{ flexGrow: Math.max(1, row.lanes.length) }}>
                  <span className="sc-label">{row.label || section.title}</span>
                  <div className="sc-track">
                    {row.lanes.map((lane, laneIndex) => (
                      <div key={laneIndex} className="sc-lane">
                        {lane.map((bar, barIndex) => (
                          <BarView key={barIndex} bar={bar} now={now} />
                        ))}
                      </div>
                    ))}
                    {row.note && <p className="sc-note">{row.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <span className="sc-now-line" aria-hidden="true">
          <b>Now</b>
        </span>
      </div>
    </div>
  );
}
