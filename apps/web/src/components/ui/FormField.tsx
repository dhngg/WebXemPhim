import { cloneElement, createContext, isValidElement, useContext, useId, type ReactElement, type ReactNode } from 'react';

interface FieldControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'aria-required'?: true;
}

/**
 * Cho phép control lồng sâu (VD: CurrencyInput bên trong <Controller>) nhận id/aria của field,
 * vì cloneElement chỉ tác động lên phần tử con trực tiếp.
 */
const FieldContext = createContext<FieldControlProps | null>(null);

export function useFieldControlProps(): FieldControlProps | null {
  return useContext(FieldContext);
}

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Một phần tử input/select/textarea (hoặc Controller bọc control dùng useFieldControlProps). */
  children: ReactElement<Record<string, unknown>>;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const controlProps: FieldControlProps = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  };

  const control = isValidElement(children) ? cloneElement(children, { ...controlProps }) : children;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <FieldContext.Provider value={controlProps}>{control}</FieldContext.Provider>
      {hint && !error && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
