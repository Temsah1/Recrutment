import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FieldMeta {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
}

function FieldFooter({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="field-error" role="alert">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="field-hint">
        {hint}
      </p>
    );
  }
  return null;
}

export function FieldLabel({
  htmlFor,
  children,
  required,
  optional,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      <span className="flex items-center gap-1.5">
        {children}
        {required ? (
          <span className="text-ember-600" aria-label="required">
            *
          </span>
        ) : null}
      </span>
      {optional ? <span className="text-2xs font-normal uppercase tracking-wide text-muted">Optional</span> : null}
    </label>
  );
}

export type TextFieldProps = FieldMeta &
  InputHTMLAttributes<HTMLInputElement> & {
    containerClassName?: string;
  };

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, required, optional, id, className, containerClassName, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={containerClassName}>
      <FieldLabel htmlFor={fieldId} required={required} optional={optional}>
        {label}
      </FieldLabel>
      <input
        ref={ref}
        id={fieldId}
        className={cn('input', error && 'input-invalid', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...props}
      />
      <FieldFooter id={fieldId} hint={hint} error={error} />
    </div>
  );
});

export type TextAreaFieldProps = FieldMeta &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    containerClassName?: string;
    counter?: { value: number; max: number };
  };

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField(
    { label, error, hint, required, optional, id, className, containerClassName, counter, ...props },
    ref,
  ) {
    const generated = useId();
    const fieldId = id ?? generated;
    return (
      <div className={containerClassName}>
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor={fieldId} required={required} optional={optional}>
            {label}
          </FieldLabel>
          {counter ? (
            <span
              className={cn(
                'mb-1.5 text-2xs tabular-nums text-muted',
                counter.value > counter.max && 'font-semibold text-danger-600',
              )}
            >
              {counter.value.toLocaleString()} / {counter.max.toLocaleString()}
            </span>
          ) : null}
        </div>
        <textarea
          ref={ref}
          id={fieldId}
          className={cn('textarea', error && 'input-invalid', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
        <FieldFooter id={fieldId} hint={hint} error={error} />
      </div>
    );
  },
);

export type SelectFieldProps = FieldMeta &
  SelectHTMLAttributes<HTMLSelectElement> & {
    containerClassName?: string;
    children: ReactNode;
  };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, required, optional, id, className, containerClassName, children, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={containerClassName}>
      <FieldLabel htmlFor={fieldId} required={required} optional={optional}>
        {label}
      </FieldLabel>
      <select
        ref={ref}
        id={fieldId}
        className={cn('select', error && 'input-invalid', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...props}
      >
        {children}
      </select>
      <FieldFooter id={fieldId} hint={hint} error={error} />
    </div>
  );
});

export function CheckboxField({
  id,
  label,
  error,
  checked,
  onChange,
  onBlur,
  name,
  disabled,
  inputRef,
}: {
  id?: string;
  label: ReactNode;
  error?: string;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  name?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          ref={inputRef}
          id={fieldId}
          name={name}
          type="checkbox"
          className={cn('checkbox mt-0.5', error && 'outline outline-2 outline-danger-500')}
          checked={checked}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />
        <label htmlFor={fieldId} className="cursor-pointer text-sm leading-relaxed text-navy-900">
          {label}
        </label>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field-error pl-7" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
