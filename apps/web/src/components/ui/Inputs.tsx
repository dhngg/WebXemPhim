import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFieldControlProps } from './FormField';

/** Ô tìm kiếm có debounce — gọi onChange sau `delay` ms khi người dùng ngừng gõ. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Tìm kiếm…',
  delay = 300,
  label = 'Tìm kiếm',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = window.setTimeout(() => onChange(draft), delay);
    return () => window.clearTimeout(t);
  }, [draft, value, delay, onChange]);

  return (
    <div className="search-input">
      <Search size={16} aria-hidden="true" />
      <input
        className="input"
        type="search"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft && (
        <button type="button" className="search-input__clear" aria-label="Xóa tìm kiếm" onClick={() => setDraft('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Hàng bộ lọc phía trên bảng/danh sách. */
export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__filters">{children}</div>
      {actions && <div className="filter-bar__actions">{actions}</div>}
    </div>
  );
}

/** Chuyển "3.800.000" -> 3800000 */
export function parseVnd(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
};

/** Ô nhập tiền VND: hiển thị phân cách hàng nghìn kiểu vi-VN, trả về số nguyên. */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onChange, className, ...rest },
  ref,
) {
  const field = useFieldControlProps();
  const display = value === undefined || value === null || Number.isNaN(value) ? '' : new Intl.NumberFormat('vi-VN').format(value);
  return (
    <div className="currency-input">
      <input
        ref={ref}
        {...field}
        {...rest}
        className={cn('input', className)}
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(parseVnd(e.target.value))}
      />
      <span className="currency-input__suffix" aria-hidden="true">
        ₫
      </span>
    </div>
  );
});

/** DatePicker dùng input type=date gốc (accessible, có lịch trên mobile). Giá trị yyyy-MM-dd. */
export const DatePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function DatePicker({ className, ...rest }, ref) {
    return <input ref={ref} type="date" className={cn('input', className)} {...rest} />;
  },
);

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('select', className)} {...rest}>
      {children}
    </select>
  );
}
