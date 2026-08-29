type CircularProgressProps = {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
};

export default function CircularProgress({
  percent,
  size = 76,
  stroke = 7,
  label,
}: CircularProgressProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--cream-dark)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="circular-progress-fill"
        />
      </svg>
      <span className="circular-progress-label">{label ?? `${Math.round(percent)}%`}</span>
    </div>
  );
}
