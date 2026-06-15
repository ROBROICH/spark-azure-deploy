import { cn } from '@/features/ui/style/cn';
import {
  Close as DialogClosePrimitive,
  Content as DialogContentPrimitive,
  Description as DialogDescriptionPrimitive,
  Overlay as DialogOverlayPrimitive,
  Portal as DialogPortalPrimitive,
  Root as DialogRoot,
  Title as DialogTitlePrimitive,
} from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

function Dialog(props: React.ComponentProps<typeof DialogRoot>) {
  return <DialogRoot data-slot="dialog" {...props} />;
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPortalPrimitive>,
) {
  return <DialogPortalPrimitive data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogClosePrimitive>) {
  return <DialogClosePrimitive data-slot="dialog-close" {...props} />;
}

function DialogOverlay(
  props: React.ComponentProps<typeof DialogOverlayPrimitive>,
) {
  const { className, ...rest } = props;
  return (
    <DialogOverlayPrimitive
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...rest}
    />
  );
}

function DialogContent(
  props: React.ComponentProps<typeof DialogContentPrimitive> & {
    showCloseButton?: boolean;
    /**
     * Applies a className to the inner rounded container that wraps dialog children.
     * This is a layout escape hatch for cases where the dialog body needs a custom
     * flex direction or overflow strategy. Avoid copying this pattern to new primitives.
     */
    innerClassName?: string;
  },
) {
  const {
    className,
    innerClassName,
    children,
    showCloseButton = true,
    onOpenAutoFocus,
    onCloseAutoFocus,
    ...rest
  } = props;

  const { t } = useTranslation('shared');
  const returnFocusRef = React.useRef<Element | null>(null);

  const handleOpenAutoFocus = (e: Event) => {
    // Capture the element that was focused before the dialog opened so we can
    // restore focus to it on close, including programmatic opens such as URL
    // search param changes.
    returnFocusRef.current = document.activeElement;
    onOpenAutoFocus?.(e);
  };

  const handleCloseAutoFocus = (e: Event) => {
    if (returnFocusRef.current instanceof HTMLElement) {
      e.preventDefault();
      returnFocusRef.current.focus();
    }
    onCloseAutoFocus?.(e);
    returnFocusRef.current = null;
  };

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogContentPrimitive
        data-slot="dialog-content"
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-[20px] border-[0.5px] border-white/60 bg-white/20 p-1 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)] backdrop-blur-[8px] duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...rest}
      >
        <div
          data-slot="dialog-inner"
          className={cn(
            'flex max-h-[95vh] min-h-0 flex-col overflow-hidden rounded-[16px] bg-neutral-white',
            innerClassName,
          )}
        >
          {children}
        </div>
        {showCloseButton && (
          <DialogClosePrimitive
            data-slot="dialog-close"
            className="focus-ring data-[state=open]:text-muted-foreground absolute top-5 right-5 rounded-xs opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">{t('dialog.closeAriaLabel')}</span>
          </DialogClosePrimitive>
        )}
      </DialogContentPrimitive>
    </DialogPortal>
  );
}

function DialogHeader(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex items-center justify-start gap-2 border-b border-border-primary py-[15px] pr-2 pl-4',
        className,
      )}
      {...rest}
    />
  );
}

function DialogBody(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="dialog-body"
      tabIndex={-1}
      className={cn(
        'overflow-y-auto px-4 py-6 text-[13px] text-text-secondary outline-none',
        className,
      )}
      {...rest}
    />
  );
}

function DialogFooter(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border-primary p-2 sm:flex-row sm:justify-between',
        className,
      )}
      {...rest}
    />
  );
}

function DialogTitle(props: React.ComponentProps<typeof DialogTitlePrimitive>) {
  const { className, ...rest } = props;
  return (
    <DialogTitlePrimitive
      data-slot="dialog-title"
      className={cn(
        'flex-1 text-base leading-[20px] font-medium tracking-[-0.16px] text-text-primary',
        className,
      )}
      {...rest}
    />
  );
}

function DialogDescription(
  props: React.ComponentProps<typeof DialogDescriptionPrimitive>,
) {
  const { className, ...rest } = props;
  return (
    <DialogDescriptionPrimitive
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...rest}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
};
