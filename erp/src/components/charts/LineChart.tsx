'use client';

export function LineChart({
  data,
  valueKey = 'value',
  color = '#3B82F6',
  height = 120,
  formatValue,
}: {
  data: { label: string; [key: string]: unknown }[];
  valueKey?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (data.length < 2) return <p className="text-xs text-gray-400">Not enough data</p>;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 400;
  const H = height - 24;
  const step = W / (data.length - 1);
  const fmt = formatValue ?? ((v: number) => v.toFixed(0));

  const pts = data.map((d, i) => {
    const v = Number(d[valueKey]) || 0;
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return { x, y, v, label: d.label };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="w-full overflow-hidden" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color}>
              <title>{p.label}: {fmt(p.v)}</title>
            </circle>
            <text x={p.x} y={height - 4} textAnchor="middle" fontSize={9} fill="#9CA3AF">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
