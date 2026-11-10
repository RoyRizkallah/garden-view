import { useEffect, useState } from 'react';

/**
 * Working hours as the staff lists write them ("7am – 3pm", "11pm – 7am", "Day · 7am – 7pm"),
 * read into minutes from midnight. A shift whose end comes before its start runs past midnight.
 * All times are the building's: Beirut.
 */
export type Shift = { start: number; end: number };

const DAY = 24 * 60;
const TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;

export function parseShift(text: string | undefined): Shift | undefined {
  if (!text) return undefined;
  const times = [...text.matchAll(TIME)].map(([, hour, minute, half]) => {
    const h = (Number(hour) % 12) + (half.toLowerCase() === 'pm' ? 12 : 0);
    return h * 60 + Number(minute ?? 0);
  });
  return times.length >= 2 ? { start: times[0], end: times[1] } : undefined;
}

/** how long a shift lasts, in minutes (a shift from a time to the same time is the whole day) */
export const shiftLength = ({ start, end }: Shift) => (end - start + DAY) % DAY || DAY;

export function isOnDuty(text: string | undefined, now: number): boolean {
  const shift = parseShift(text);
  return Boolean(shift && (now - shift.start + DAY) % DAY < shiftLength(shift));
}

const beirutClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Beirut',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** minutes since midnight in Beirut */
export function beirutMinutes(date = new Date()): number {
  const parts = beirutClock.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

/** Beirut time now, in minutes since midnight, kept current to the minute */
export function useBeirutNow(): number {
  const [now, setNow] = useState(() => beirutMinutes());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(beirutMinutes()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** "7am", "11:30pm" */
export function clockLabel(minutes: number): string {
  const m = ((minutes % DAY) + DAY) % DAY;
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  const h12 = hour % 12 || 12;
  return `${h12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/** A bar on the schedule board: who works this stretch, where it sits on the day (0–1 from the board's start). */
export type Bar = { names: string[]; shift: Shift; hours: string; from: number; width: number };
export type BoardRow = { label: string; lanes: Bar[][]; note?: string };
export type BoardSection = { title: string; rows: BoardRow[] };
export type Entry = { name: string; hours?: string };

/**
 * Lays rows of people out on a 24-hour board that starts at `startsAt` (minutes from midnight).
 * People with the same hours share one bar; shifts that overlap go on separate lanes, so a row
 * reads as a relay through the day. A shift that crosses the board's start is drawn in two pieces.
 */
export function layoutRow(label: string, entries: Entry[], startsAt: number): BoardRow {
  const bars: { names: string[]; shift: Shift; hours: string }[] = [];
  const unscheduled: string[] = [];
  for (const entry of entries) {
    const shift = parseShift(entry.hours);
    if (!shift) {
      unscheduled.push(entry.name);
      continue;
    }
    const same = bars.find((bar) => bar.shift.start === shift.start && bar.shift.end === shift.end);
    if (same) same.names.push(entry.name);
    else bars.push({ names: [entry.name], shift, hours: entry.hours! });
  }

  const lanes: Bar[][] = [];
  const laneEnds: number[] = [];
  const offset = (minutes: number) => (minutes - startsAt + DAY) % DAY;
  for (const bar of [...bars].sort((a, b) => offset(a.shift.start) - offset(b.shift.start))) {
    const from = offset(bar.shift.start);
    const length = shiftLength(bar.shift);
    const pieces =
      from + length <= DAY
        ? [{ from, length }]
        : [
            { from, length: DAY - from },
            { from: 0, length: from + length - DAY },
          ];
    let lane = laneEnds.findIndex((end) => end <= from && from + length <= DAY);
    if (lane === -1 || pieces.length > 1) {
      lane = lanes.length;
      lanes.push([]);
      laneEnds.push(0);
    }
    for (const piece of pieces) {
      lanes[lane].push({ ...bar, from: piece.from / DAY, width: piece.length / DAY });
    }
    laneEnds[lane] = pieces.length > 1 ? DAY : from + length;
  }

  const note = unscheduled.length ? `${unscheduled.join(', ')} · no fixed hours` : undefined;
  return { label, lanes, note };
}

/** where the board should start: the hour of the day's earliest start, so most shifts read left to right */
export function boardStart(hours: (string | undefined)[]): number {
  const starts = hours.map(parseShift).filter((shift): shift is Shift => Boolean(shift)).map((shift) => shift.start);
  return starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 0;
}
