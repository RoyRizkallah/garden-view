type Series = { label: string; color: string; values: number[] };

type LineChartProps = {
  labels: string[];
  series: Series[];
  height?: number;
};

const W = 600;

export default function LineChart({ labels, series, height = 220 }: LineChartProps) {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 1);
  const niceMax = Math.ceil((max * 1.15) / 100) * 100;
  const n = labels.length;
  const stepX = n > 1 ? W / (n - 1) : 0;

  function points(values: number[]) {
    return values
      .map((v, i) => {
        const x = n > 1 ? i * stepX : W / 2;
        const y = height - (v / niceMax) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }

  const gridLines = [0, 0.33, 0.66, 1];

  return (
    <div className="line-chart">
      <div className="line-chart-legend">
        {series.map((s) => (
          <span key={s.label} className="line-chart-legend-item">
            <span className="line-chart-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="line-chart-body">
        <div className="line-chart-yaxis">
          {gridLines
            .slice()
            .reverse()
            .map((g) => (
              <span key={g}>${Math.round(niceMax * g).toLocaleString()}</span>
            ))}
        </div>
        <div className="line-chart-plot">
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="line-chart-svg">
            {gridLines.map((g) => (
              <line
                key={g}
                x1="0"
                x2={W}
                y1={height - g * height}
                y2={height - g * height}
                className="line-chart-grid"
              />
            ))}
            {series.map((s) => (
              <polyline
                key={s.label}
                points={points(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((s) =>
              s.values.map((v, i) => {
                const x = n > 1 ? i * stepX : W / 2;
                const y = height - (v / niceMax) * height;
                return <circle key={`${s.label}-${i}`} cx={x} cy={y} r="4" fill={s.color} />;
              }),
            )}
          </svg>
        </div>
      </div>
      <div className="line-chart-xaxis">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
