import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Hộp thoại chung (form nhỏ). Đóng bằng Esc / click nền / nút X. */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ maxWidth: width }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Đóng" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {description && <p className="dialog__desc">{description}</p>}
        <div style={{ marginTop: 'var(--space-4)' }}>{children}</div>
        {footer && <div className="dialog__actions">{footer}</div>}
      </div>
    </div>
  );
}
