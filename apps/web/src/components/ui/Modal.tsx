import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

const widths = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'dialog-content fixed left-1/2 top-1/2 z-50 max-h-[min(90vh,52rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-lift focus:outline-none sm:p-7',
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold tracking-tight text-navy-900">
                {title}
              </Dialog.Title>
              <Dialog.Description
                className={description ? 'mt-1.5 text-sm leading-relaxed text-muted' : 'sr-only'}
              >
                {description ?? 'Dialog'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="-mr-1 -mt-1 rounded-lg p-2 text-muted transition hover:bg-navy-900/5 hover:text-navy-900"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>
          {children ? <div className="mt-6">{children}</div> : null}
          {footer ? (
            <div className="mt-7 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  isLoading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold text-navy-900 transition hover:bg-mist"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-60',
              tone === 'danger' ? 'bg-danger-600 hover:bg-danger-700' : 'bg-navy-900 hover:bg-navy-950',
            )}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    />
  );
}
