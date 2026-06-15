import { cn } from '@/features/ui/style/cn';
import {
  Content as SheetContent,
  Overlay as SheetOverlay,
  Portal as SheetPortal,
  Root as SheetRoot,
} from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

type SidebarPanelShellProps = {
  open: boolean;
  onClose: () => void;
  sidebarExpanded: boolean;
  children: ReactNode;
  /** Extra classes applied to the panel container — use for width and any panel-specific overrides. */
  className?: string;
  /** aria-describedby id, or undefined to suppress the warning when no description exists. */
  ariaDescribedBy?: string;
  /** When true, Radix adds scroll locking, an overlay, and `aria-hidden` on outside content. Default false. */
  modal?: boolean;
};

export const SidebarPanelShell = (props: SidebarPanelShellProps) => {
  const {
    open,
    onClose,
    sidebarExpanded,
    children,
    className,
    ariaDescribedBy,
    modal = false,
  } = props;

  return (
    <SheetRoot
      modal={modal}
      open={open}
      onOpenChange={(next) => !next && open && onClose()}
    >
      <SheetPortal>
        {modal && (
          <SheetOverlay className="fixed inset-0 z-40 bg-black/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        )}
        <SheetContent
          aria-describedby={ariaDescribedBy}
          onInteractOutside={(e) => {
            if (!modal) {
              e.preventDefault();
            }
          }}
          className={cn(
            'fixed top-4 z-50 flex h-[calc(100dvh-2rem)] min-h-0 w-[28rem] flex-col overflow-hidden rounded-[16px] border border-border-primary bg-neutral-white shadow-flat transition-all duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
            sidebarExpanded ? 'right-68' : 'right-16',
            className,
          )}
        >
          {children}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
};
