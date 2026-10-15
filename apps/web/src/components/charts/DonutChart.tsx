import { useState } from 'react';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  note?: string;
}

/**
 * Biểu đồ vành khuyên (cơ cấu). Khe 2px giữa các phần; legend luôn hiển thị kèm giá trị + %,
 * nên nhận diện không phụ thuộc màu. Hover/focus một phần để làm nổi bật.
 */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  format,
  title,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  format: (v: number) => string;
  title: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const stroke = 22;
  const C = 2 * Math.PI * R;
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <figure className="donut" aria-label={title}>
      <div className="donut__ring">
        <svg viewBox="0 0 180 180" role="img" aria-label={title}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * C;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.key ? stroke + 4 : stroke}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 90 90)"
                  opacity={active && active !== s.key ? 0.45 : 1}
                  onMouseEnter={() => setActive(s.key)}
                  onMouseLeave={() => setActive(null)}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="donut__center">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut__legend">
        {slices.map((s) => (
          <li
            key={s.key}
            tabIndex={0}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive(null)}
            className={active === s.key ? 'is-active' : undefined}
          >
            <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="donut__label">
              {s.label}
              {s.note && <small> ({s.note})</small>}
            </span>
            <span className="donut__value">
              {format(s.value)} <small>({total ? Math.round((s.value / total) * 100) : 0}%)</small>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
