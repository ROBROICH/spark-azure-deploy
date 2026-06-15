import * as React from 'react';
import { useMobile } from '@/features/ui/responsive/useMobile';

type SidebarState = 'expanded' | 'collapsed';

const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

export type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export type UseSidebarContextValueParams = {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const SidebarContext = React.createContext<SidebarContextValue | null>(
  null,
);

/**
 * Builds the shared sidebar state for desktop and mobile layouts.
 *
 * @param params Optional controlled-state inputs for the sidebar.
 * @returns The sidebar context value consumed by the provider and hooks.
 */
export function useSidebarContextValue(
  params: UseSidebarContextValueParams,
): SidebarContextValue {
  const { defaultOpen = false, open: openProp, onOpenChange } = params;
  const isMobile = useMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((currentValue: boolean) => boolean)) => {
      const nextOpen = typeof value === 'function' ? value(open) : value;
      if (onOpenChange) {
        onOpenChange(nextOpen);
        return;
      }
      setUncontrolledOpen(nextOpen);
    },
    [onOpenChange, open],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((currentValue) => !currentValue);
      return;
    }
    setOpen((currentValue) => !currentValue);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const state: SidebarState = open ? 'expanded' : 'collapsed';

  return React.useMemo(
    () => ({
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, state, toggleSidebar],
  );
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}
