import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'dark' | 'secondary' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  iconOnly?: boolean;
}

function buttonClass({ variant = 'primary', size = 'md', block, iconOnly }: StyleProps, extra?: string) {
  return cn(
    'btn',
    `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    iconOnly && 'btn--icon',
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, iconOnly, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, iconOnly }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant,
  size,
  block,
  iconOnly,
  className,
  ...rest
}: LinkProps & StyleProps) {
  return <Link className={buttonClass({ variant, size, block, iconOnly }, className)} {...rest} />;
}
