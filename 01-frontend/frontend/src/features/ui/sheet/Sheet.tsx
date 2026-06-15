import {
  Close as SheetClosePrimitive,
  Content as SheetContentPrimitive,
  Description as SheetDescriptionPrimitive,
  Overlay as SheetOverlayPrimitive,
  Portal as SheetPortalPrimitive,
  Root as SheetRoot,
  Title as SheetTitlePrimitive,
  Trigger as SheetTriggerPrimitive,
} from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/features/ui/style/cn';

function Sheet(props: React.ComponentProps<typeof SheetRoot>) {
  return <SheetRoot data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetTriggerPrimitive>,
) {
  return <SheetTriggerPrimitive data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetClosePrimitive>) {
  return <SheetClosePrimitive data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPortalPrimitive>) {
  return <SheetPortalPrimitive data-slot="sheet-portal" {...props} />;
}

function SheetOverlay(
  props: React.ComponentProps<typeof SheetOverlayPrimitive>,
) {
  const { className, ...sheetOverlayProps } = props;

  return (
    <SheetOverlayPrimitive
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...sheetOverlayProps}
    />
  );
}

function SheetContent(
  props: React.ComponentProps<typeof SheetContentPrimitive> & {
    side?: 'top' | 'right' | 'bottom' | 'left';
  },
) {
  const { className, children, side = 'right', ...sheetContentProps } = props;
  const { t } = useTranslation('shared');

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetContentPrimitive
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-bg-primary shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 border-l border-border-primary data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 border-r border-border-primary data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b border-border-primary data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t border-border-primary data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...sheetContentProps}
      >
        {children}
        <SheetClosePrimitive className="focus-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">{t('dialog.closeAriaLabel')}</span>
        </SheetClosePrimitive>
      </SheetContentPrimitive>
    </SheetPortal>
  );
}

function SheetHeader(props: React.ComponentProps<'div'>) {
  const { className, ...sheetHeaderProps } = props;

  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...sheetHeaderProps}
    />
  );
}

function SheetTitle(props: React.ComponentProps<typeof SheetTitlePrimitive>) {
  return <SheetTitlePrimitive data-slot="sheet-title" {...props} />;
}

function SheetDescription(
  props: React.ComponentProps<typeof SheetDescriptionPrimitive>,
) {
  return <SheetDescriptionPrimitive data-slot="sheet-description" {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
