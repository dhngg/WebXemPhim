import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Thẻ KPI (ảnh demo Dashboard). */
export function StatCard({
  label,
  value,
  unit,
  icon,
  footer,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  tone?: 'neutral' | 'success' | 'primary' | 'danger';
}) {
  return (
    <div className={cn('card stat-card', `stat-card--${tone}`)}>
      <div className="stat-card__head">
        <span className="stat-card__label">{label}</span>
        {icon && <span className="stat-card__icon">{icon}</span>}
      </div>
      <p className="stat-card__value">
        {value}
        {unit && <span className="stat-card__unit"> {unit}</span>}
      </p>
      {footer && <div className="stat-card__footer">{footer}</div>}
    </div>
  );
}

/** Danh sách cặp nhãn – giá trị cho trang chi tiết. */
export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="kv">
      {items.map((it) => (
        <div key={it.label} className="kv__row">
          <dt>{it.label}</dt>
          <dd>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === value}
          className="tabs__tab"
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="tabs__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="row" style={{ flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      <div className={flush ? 'card__flush' : 'card__body'}>{children}</div>
    </section>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
