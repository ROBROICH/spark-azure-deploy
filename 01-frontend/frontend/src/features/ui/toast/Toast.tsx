import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import i18n from 'i18next';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import {
  Toaster as SonnerToaster,
  toast as sonnerToast,
  type ToasterProps,
} from 'sonner';

type ToastVariant = 'info' | 'success' | 'error';

type ToastSurfaceProps = {
  variant: ToastVariant;
  message: string;
  onClose: () => void;
  closeAriaLabel: string;
};

const INNER_BG_BY_VARIANT = {
  info: 'bg-slate-800',
  success: 'bg-green-800',
  error: 'bg-red-800',
} as const satisfies Record<ToastVariant, string>;

const ICON_BY_VARIANT = {
  info: Info,
  success: CircleCheck,
  error: TriangleAlert,
} as const satisfies Record<ToastVariant, typeof Info>;

const ToastSurface = (props: ToastSurfaceProps) => {
  const { variant, message, onClose, closeAriaLabel } = props;
  const Icon = ICON_BY_VARIANT[variant];
  const innerBg = INNER_BG_BY_VARIANT[variant];

  return (
    <div className="inline-flex rounded-[12px] border border-white/60 bg-white/20 p-1 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)] backdrop-blur-[16px]">
      <div
        className={cn(
          'flex min-w-0 items-center gap-1 rounded-lg p-1 text-neutral-white',
          innerBg,
        )}
      >
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center p-1"
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 px-0 py-[3px] text-[13px] leading-[18px]">
          {message}
        </p>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onClose}
          aria-label={closeAriaLabel}
          className="text-neutral-white hover:bg-white/10 hover:text-neutral-white active:bg-white/20"
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
};

type ShowToastOptions = {
  duration?: number;
  closeAriaLabel?: string;
};

const showToast = (
  variant: ToastVariant,
  message: string,
  options?: ShowToastOptions,
) => {
  const closeAriaLabel =
    options?.closeAriaLabel ?? i18n.t('toast.closeAriaLabel', { ns: 'shared' });

  return sonnerToast.custom(
    (id) => (
      <ToastSurface
        variant={variant}
        message={message}
        onClose={() => sonnerToast.dismiss(id)}
        closeAriaLabel={closeAriaLabel}
      />
    ),
    {
      duration: options?.duration,
      unstyled: true,
    },
  );
};

export const toast = {
  info: (message: string, options?: ShowToastOptions) =>
    showToast('info', message, options),
  success: (message: string, options?: ShowToastOptions) =>
    showToast('success', message, options),
  error: (message: string, options?: ShowToastOptions) =>
    showToast('error', message, options),
};

// Sonner's default hotkey is Alt+T (expand/collapse). Escape-key dismissal
// is not built in; individual toasts are dismissed via the close button.
export const Toaster = (props: ToasterProps) => {
  return <SonnerToaster position="top-right" {...props} />;
};
