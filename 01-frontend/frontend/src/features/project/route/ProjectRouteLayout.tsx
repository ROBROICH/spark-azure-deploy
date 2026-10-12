import { useGraph } from '@/db/nodes/hooks/useGraph';
import { ActionSidebar } from '@/features/project/action-sidebar/ActionSidebar';
import { ProjectNavbar } from '@/features/project/route-navbar/ProjectNavbar';
import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import { SidebarInset, SidebarProvider } from '@/features/ui/sidebar/Sidebar';
import { cn } from '@/features/ui/style/cn';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { Suspense, type CSSProperties } from 'react';

type ProjectRouteContentProps = {
  isIndexRoute: boolean;
  isNachforderungen: boolean;
  isSwimlaneRoute: boolean;
};

function ProjectRouteContent(props: ProjectRouteContentProps) {
  const { isIndexRoute, isNachforderungen, isSwimlaneRoute } = props;
  return (
    <SidebarInset
      className={cn(
        'min-h-0 min-w-0 overflow-x-hidden',
        // Below lg (and thus at high browser zoom, which shrinks the CSS
        // viewport) the pinned app-shell collapses the swimlane pane behind the
        // stacked headers, so allow the project pane to scroll vertically and
        // only re-pin the headers from lg upward (WCAG 1.4.10 reflow).
        isSwimlaneRoute
          ? 'overflow-y-auto lg:overflow-y-hidden'
          : 'overflow-y-auto',
        isIndexRoute && 'bg-neutral-white',
      )}
    >
      {isIndexRoute && (
        <Suspense fallback={<ProjectNavbarSkeleton />}>
          <ProjectNavbar selectedStep="overview" />
        </Suspense>
      )}
      {isNachforderungen && (
        <Suspense fallback={<ProjectNavbarSkeleton />}>
          <ProjectNavbar selectedStep="overview" showStepSelect={false} />
        </Suspense>
      )}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip',
          isIndexRoute && 'items-center',
        )}
      >
        <Outlet />
      </div>
    </SidebarInset>
  );
}

/**
 * Shared layout shell for project-level routes under /verfahren/$verfahrenId.
 */
export function ProjectRouteLayout() {
  const routerState = useRouterState();

  // Can be used to show a loading indicator while graph data is loading.
  // Alternatively can be moved into route loader
  const { isLoadingRequiredGraphData: _isLoadingRequiredGraphData } =
    useGraph();

  const routeIds = routerState.matches.map((match) => match.routeId);
  const isIndexRoute = routeIds.includes('/verfahren/$verfahrenId/');
  const isSwimlaneRoute =
    routeIds.includes('/verfahren/$verfahrenId/mvp') ||
    routeIds.includes('/verfahren/$verfahrenId/ewms/') ||
    routeIds.includes('/verfahren/$verfahrenId/nachforderungen/');
  const isNachforderungen = routeIds.includes(
    '/verfahren/$verfahrenId/nachforderungen/',
  );

  return (
    <div className={cn('bg-secondary flex h-screen min-h-screen flex-col')}>
      <SidebarProvider
        defaultOpen={false}
        className="min-h-0 min-w-0 flex-1"
        style={
          {
            '--sidebar-width': '14rem',
            '--sidebar-width-icon': '3rem',
          } as CSSProperties
        }
      >
        <ProjectRouteContent
          isIndexRoute={isIndexRoute}
          isNachforderungen={isNachforderungen}
          isSwimlaneRoute={isSwimlaneRoute}
        />
        <ActionSidebar />
      </SidebarProvider>
    </div>
  );
}
