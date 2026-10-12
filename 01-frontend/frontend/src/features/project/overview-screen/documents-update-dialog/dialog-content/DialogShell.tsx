import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Info, Minimize2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type DialogShellWidth = 'narrow' | 'wide';
export type DialogShellHeight = 'auto' | 'fixed';

type DialogShellProps = {
  width: DialogShellWidth;
  /**
   * `auto` lets the inner panel size to its content up to the viewport
   * (current default). `fixed` pins the inner panel to a stable 60vh so the
   * step (e.g. the diff review) feels consistent regardless of content size.
   */
  height?: DialogShellHeight;
  title: string;
  description?: ReactNode;
  onMinimize?: () => void;
  closeLabel?: string;
  /**
   * When true, intercept Escape, outside-click, and pointer-down-outside so the
   * dialog cannot be dismissed. Use for phases with in-flight work that would
   * be lost on close or require an explicit user decision. Defaults to false so
   * benign phases such as file selection keep normal a11y dismissal.
   */
  lockClose?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

const WIDTH_CLASS = {
  narrow: 'w-[584px]',
  wide: 'w-[904px]',
} as const satisfies Record<DialogShellWidth, string>;

const HEIGHT_CLASS = {
  auto: 'max-h-[calc(100vh-2rem)]',
  fixed: 'h-[60vh] max-h-[calc(100vh-2rem)]',
} as const satisfies Record<DialogShellHeight, string>;

export const DialogShell = (props: DialogShellProps) => {
  const {
    width,
    height = 'auto',
    title,
    description,
    onMinimize,
    closeLabel,
    lockClose = false,
    children,
    footer,
  } = props;
  const { t } = useTranslation('Project');

  // Radix wires `aria-describedby` from the rendered `DialogDescription`. When
  // a step has no description, pass the prop explicitly as `undefined` to opt
  // out of Radix's dev warning. Conditionally spreading is the only way to
  // distinguish "prop present with value undefined" (opt-out) from "prop
  // absent" (Radix logs the warning).
  const ariaDescribedByOptOut = description
    ? undefined
    : { 'aria-describedby': undefined };

  return (
    <DialogContent
      showCloseButton={false}
      {...ariaDescribedByOptOut}
      onPointerDownOutside={
        lockClose ? (event) => event.preventDefault() : undefined
      }
      onInteractOutside={
        lockClose ? (event) => event.preventDefault() : undefined
      }
      onEscapeKeyDown={
        lockClose ? (event) => event.preventDefault() : undefined
      }
      className={cn(
        'max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-1rem)]',
        WIDTH_CLASS[width],
      )}
      innerClassName={cn('rounded-2xl bg-white', HEIGHT_CLASS[height])}
    >
      <DialogHeader className="flex h-12 flex-row items-center justify-between gap-2 space-y-0 border-b border-slate-200 px-4 py-2 text-left sm:text-left">
        <DialogTitle className="text-base leading-5 font-medium tracking-[-0.01em] text-brand-navy">
          {title}
        </DialogTitle>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <Button
              variant="ghost"
              size="sm"
              withIcon
              onClick={onMinimize}
              className="gap-2"
            >
              <Minimize2 aria-hidden />
              {t('Documents.updateDocuments.minimize')}
            </Button>
          )}
          {closeLabel && (
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={closeLabel}
              >
                <X aria-hidden />
              </Button>
            </DialogClose>
          )}
        </div>
      </DialogHeader>
      {description && (
        <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-3 text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-navy">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <DialogDescription className="min-w-0 flex-1 text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-navy">
            {description}
          </DialogDescription>
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      {footer && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-2">
          {footer}
        </div>
      )}
    </DialogContent>
  );
};
