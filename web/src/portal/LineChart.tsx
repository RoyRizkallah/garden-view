type Series = { label: string; color: string; values: number[] };

type LineChartProps = {
  labels: string[];
  series: Series[];
  height?: number;
};

const W = 600;
const PAD_X = 6;

export default function LineChart({ labels, series, height = 220 }: LineChartProps) {
  const allValues = series.flatMap((item) => item.values);
  const max = Math.max(...allValues, 1);
  const niceMax = Math.max(100, Math.ceil((max * 1.15) / 100) * 100);
  const n = labels.length;
  const stepX = n > 1 ? (W - PAD_X * 2) / (n - 1) : 0;

  function points(values: number[]) {
    return values
      .map((value, index) => {
        const x = n > 1 ? PAD_X + index * stepX : W / 2;
        const y = height - (value / niceMax) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="line-chart">
      <div className="line-chart-legend">
        {series.map((item) => (
          <span key={item.label} className="line-chart-legend-item">
            <span className="line-chart-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="line-chart-body">
        <div className="line-chart-yaxis" aria-hidden="true">
          {gridLines
            .slice()
            .reverse()
            .map((line) => (
              <span key={line}>${Math.round(niceMax * line).toLocaleString('en-US')}</span>
            ))}
        </div>
        <div className="line-chart-plot">
          <svg
            viewBox={`0 0 ${W} ${height}`}
            preserveAspectRatio="none"
            className="line-chart-svg"
            role="img"
            aria-label={series.map((item) => `${item.label}: ${item.values.join(', ')}`).join('; ')}
          >
            {gridLines.map((line) => (
              <line
                key={line}
                x1="0"
                x2={W}
                y1={height - line * height}
                y2={height - line * height}
                className="line-chart-grid"
              />
            ))}
            {series.map((item) => (
              <polyline
                key={item.label}
                points={points(item.values)}
                fill="none"
                stroke={item.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((item) =>
              item.values.map((value, index) => {
                const x = n > 1 ? PAD_X + index * stepX : W / 2;
                const y = height - (value / niceMax) * height;
                return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="3.5" fill={item.color} />;
              }),
            )}
          </svg>
        </div>
      </div>
      <div className="line-chart-xaxis" aria-hidden="true">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
