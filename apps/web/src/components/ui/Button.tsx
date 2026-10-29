import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-navy-900 text-white shadow-soft hover:bg-navy-950 active:bg-navy-950 disabled:hover:bg-navy-900',
  accent:
    'bg-ember-500 text-navy-950 shadow-[0_10px_24px_-14px_rgba(242,140,40,0.9)] hover:bg-ember-400 active:bg-ember-600 disabled:hover:bg-ember-500',
  outline:
    'border border-line bg-white text-navy-900 hover:border-navy-300 hover:bg-navy-50 active:bg-navy-100',
  ghost: 'text-navy-800 hover:bg-navy-900/5 active:bg-navy-900/10',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-700',
  subtle: 'bg-navy-900/5 text-navy-900 hover:bg-navy-900/10 active:bg-navy-900/15',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-11 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2.5 rounded-xl px-6 text-[15px]',
  icon: 'h-9 w-9 rounded-lg',
};

export function buttonStyles(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition duration-200 ease-standard motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55 disabled:active:scale-100',
    variants[options.variant ?? 'primary'],
    sizes[options.size ?? 'md'],
    options.fullWidth && 'w-full',
    options.className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, fullWidth, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
