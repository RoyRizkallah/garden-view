type Segment = { value: number; color: string };

type VoteDonutProps = {
  segments: Segment[];
  size?: number;
  stroke?: number;
  centerLabel: string;
  centerSub?: string;
};

export default function VoteDonut({ segments, size = 128, stroke = 16, centerLabel, centerSub }: VoteDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let accumulated = 0;

  return (
    <div className="vote-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cream-dark)" strokeWidth={stroke} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((seg, i) => {
              const fraction = seg.value / total;
              const dash = Math.max(0, fraction * circumference - (segments.length > 1 ? 3 : 0));
              const gap = circumference - dash;
              const rotate = -90 + (accumulated / total) * 360;
              accumulated += seg.value;
              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${gap}`}
                  transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
                  className="vote-donut-segment"
                />
              );
            })}
      </svg>
      <div className="vote-donut-center">
        <strong>{centerLabel}</strong>
        {centerSub && <span>{centerSub}</span>}
      </div>
    </div>
  );
}
