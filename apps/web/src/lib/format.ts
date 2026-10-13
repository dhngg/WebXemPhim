const LOCALE = 'vi-VN';
export const BILLING_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** 3800000 -> "3.800.000 ₫" */
export function formatVnd(amount: number): string {
  return currencyFormatter.format(amount);
}

/** 3800000 -> "3,8tr" — dùng cho ghim bản đồ / nhãn hẹp. */
export function formatVndShort(amount: number): string {
  if (amount >= 1_000_000) return `${compactFormatter.format(amount / 1_000_000)}tr`;
  if (amount >= 1_000) return `${compactFormatter.format(amount / 1_000)}k`;
  return String(amount);
}

/** ISO date/datetime -> "05/10/2024" theo múi giờ Việt Nam. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: BILLING_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: BILLING_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** 0.893 -> "89,3%" */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits).replace('.', ',')}%`;
}
