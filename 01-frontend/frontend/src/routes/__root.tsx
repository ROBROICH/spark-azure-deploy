import {
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router';
import type { ParsedLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { TooltipProvider } from '../features/ui/tooltip/Tooltip';

import { CurrentUserProvider } from '@/features/access-control/current-user/CurrentUserProvider';
import { Toaster } from '@/features/ui/toast/Toast';
import {
  MOBILE_SITE_NAVBAR_ID,
  SiteNavbar,
} from '@/features/app-shell/navigation/SiteNavbar';
import { Button } from '@/features/ui/button/Button';
import { AppRouteDocumentTitle } from '@/features/document-title/app-route-title/AppRouteDocumentTitle';
import { PdfPopoutProvider } from '@/features/project/pdf-popout/PdfPopoutShellContext';
import { PdfPopoutWindow } from '@/features/project/pdf-popout/popout/PdfPopoutWindow';
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/features/ui/sidebar/Sidebar';
import type { QueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type MyRouterContext = {
  queryClient: QueryClient;
  previousLocation?: ParsedLocation;
};

const MobileSidebarTrigger = () => {
  const { openMobile, toggleSidebar } = useSidebar();
  const { t } = useTranslation('shared');

  return (
    <div className="flex items-center justify-end border-b border-border-primary bg-neutral-white px-4 py-2 md:hidden">
      <Button
        iconOnly
        variant="ghost"
        size="sm"
        aria-controls={MOBILE_SITE_NAVBAR_ID}
        aria-expanded={openMobile}
        aria-label={
          openMobile
            ? t('sidebar.closeMobileMenu')
            : t('sidebar.openMobileMenu')
        }
        onClick={toggleSidebar}
      >
        <Menu />
      </Button>
    </div>
  );
};

const AppShell = () => {
  const sidebarInsetRef = useRef<HTMLDivElement>(null);

  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Reset the root scrollable container (SidebarInset) on route changes.
  // Child layout routes with their own scrollable containers (e.g.
  // /verfahren/$verfahrenId) handle their own scroll reset separately.
  // eslint-disable-next-line no-restricted-syntax -- scroll reset is a DOM side effect tied to route changes
  useEffect(() => {
    sidebarInsetRef.current?.scrollTo({ top: 0 });
  }, [currentPath]);

  return (
    <CurrentUserProvider>
      <AppRouteDocumentTitle />
      <PdfPopoutProvider>
        <TooltipProvider>
          <SidebarProvider className="h-svh">
            <SiteNavbar />
            <SidebarInset
              ref={sidebarInsetRef}
              className="overflow-auto bg-bg-secondary"
            >
              <MobileSidebarTrigger />
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
          <PdfPopoutWindow />
          <Toaster />
        </TooltipProvider>
      </PdfPopoutProvider>
    </CurrentUserProvider>
  );
};

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: AppShell,
});
