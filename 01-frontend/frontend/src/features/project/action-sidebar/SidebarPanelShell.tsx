import { cn } from '@/features/ui/style/cn';
import {
  Content as SheetContent,
  Overlay as SheetOverlay,
  Portal as SheetPortal,
  Root as SheetRoot,
} from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useSidebar } from '@/features/ui/sidebar/Sidebar';

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

  const { isMobile } = useSidebar();
  const effectiveModal = modal || isMobile;

  const desktopPlacementClasses = cn(
    'top-4 h-[calc(100dvh-2rem)] w-[28rem] rounded-[16px]',
    sidebarExpanded ? 'right-68' : 'right-16',
  );
  const mobilePlacementClasses = 'inset-0 top-0 h-[100dvh] w-full rounded-none';

  return (
    <SheetRoot
      modal={effectiveModal}
      open={open}
      onOpenChange={(next) => !next && open && onClose()}
    >
      <SheetPortal>
        {effectiveModal && (
          <SheetOverlay className="fixed inset-0 z-40 bg-black/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        )}
        <SheetContent
          aria-describedby={ariaDescribedBy}
          onInteractOutside={(e) => {
            if (!effectiveModal) {
              e.preventDefault();
            }
          }}
          className={cn(
            'fixed z-50 flex min-h-0 flex-col overflow-hidden border border-border-primary bg-neutral-white shadow-flat transition-all duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
            isMobile ? mobilePlacementClasses : desktopPlacementClasses,
            className,
          )}
        >
          {children}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
};
