import { useId, useMemo, useState } from 'react';

export interface BarSeries {
  key: string;
  label: string;
  /** CSS color (token var). */
  color: string;
}

export interface BarDatum {
  label: string;
  values: Record<string, number>;
  highlight?: boolean;
}

interface BarChartProps {
  data: BarDatum[];
  series: BarSeries[];
  format: (v: number) => string;
  /** Định dạng nhãn trục Y (rút gọn). */
  formatAxis?: (v: number) => string;
  height?: number;
  title: string;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Biểu đồ cột nhóm (SVG thuần). Một trục Y; ≥2 series có legend; tooltip khi hover/focus từng nhóm;
 * có chế độ xem bảng (accessibility). Màu theo token, chữ dùng màu text (không dùng màu series).
 */
export function BarChart({ data, series, format, formatAxis = format, height = 240, title }: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const max = useMemo(() => niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)))), [data, series]);
  const W = 640;
  const H = height;
  const pad = { top: 12, right: 8, bottom: 28, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const groupW = innerW / Math.max(1, data.length);
  const barGap = 2;
  const barW = Math.min(28, (groupW * 0.6 - barGap * (series.length - 1)) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const activeDatum = active !== null ? data[active] : undefined;

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      <div className="chart__toolbar">
        {series.length > 1 && (
          <ul className="chart__legend">
            {series.map((s) => (
              <li key={s.key}>
                <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Xem biểu đồ' : 'Xem bảng'}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Kỳ</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num">
                      {format(d.values[s.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart__plot" onMouseLeave={() => setActive(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart__axis">
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = pad.left + i * groupW;
              const totalBarsW = series.length * barW + (series.length - 1) * barGap;
              const startX = gx + (groupW - totalBarsW) / 2;
              return (
                <g
                  key={d.label}
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(', ')}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="chart__group"
                >
                  <rect x={gx} y={pad.top} width={groupW} height={innerH} fill={active === i ? 'var(--color-bg-subtle)' : 'transparent'} />
                  {series.map((s, si) => {
                    const v = d.values[s.key] ?? 0;
                    const h = Math.max(0, (v / max) * innerH);
                    const x = startX + si * (barW + barGap);
                    const top = pad.top + innerH - h;
                    const r = Math.min(4, h);
                    // Bo tròn 4px phần đầu cột, đáy vuông bám trục.
                    const path = h > 0
                      ? `M${x},${top + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h-${barW} z`
                      : '';
                    return path ? <path key={s.key} d={path} fill={s.color} /> : null;
                  })}
                  <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" className={d.highlight ? 'chart__axis chart__axis--strong' : 'chart__axis'}>
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {activeDatum && (
            <div
              className="chart__tooltip"
              style={{ left: `${((pad.left + (active! + 0.5) * groupW) / W) * 100}%` }}
              role="status"
            >
              <strong>{activeDatum.label}</strong>
              {series.map((s) => (
                <span key={s.key} className="chart__tooltip-row">
                  <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}: <b>{format(activeDatum.values[s.key] ?? 0)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
