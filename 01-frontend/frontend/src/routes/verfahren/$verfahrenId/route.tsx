import { ProjectGraphProvider } from '@/db/nodes/ProjectGraphProvider';
import { ProjectRouteDocumentTitle } from '@/features/document-title/project-route-title/ProjectRouteDocumentTitle';
import { PdfPopoutWorkspaceProvider } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { PdfPopoutWorkspaceWindow } from '@/features/project/pdf-popout/popout/PdfPopoutWorkspaceWindow';
import { actionSidebarSearchSchema } from '@/features/project/action-sidebar/sidebarSearchParams';
import { ProjectRunningWorkflowsWatcher } from '@/features/workflow-runtime/workflow-status/ProjectRunningWorkflowsWatcher';
import { ProjectRouteSkeleton } from '@/features/project/skeletons/ProjectRouteSkeleton';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ProjectRouteErrorFallback } from '@/features/project/route/ProjectRouteErrorFallback';
import { ProjectRouteLayout } from '@/features/project/route/ProjectRouteLayout';
import { projectRouteLoader } from '@/features/project/route/projectRouteLoader';
import { ProjectVersionFreshnessCheck } from '@/features/project/route/ProjectVersionFreshnessCheck';

const layoutSearchSchema = actionSidebarSearchSchema;

const route = getRouteApi('/verfahren/$verfahrenId');

function ProjectRouteLayoutWithProviders() {
  const { verfahrenId } = route.useParams();
  const { db, projectName, projectVersion } = route.useLoaderData();

  return (
    <Suspense fallback={<ProjectRouteSkeleton />}>
      <ProjectGraphProvider key={verfahrenId} db={db}>
        <PdfPopoutWorkspaceProvider key={verfahrenId}>
          <ProjectVersionFreshnessCheck
            loaderProjectVersion={projectVersion}
            projectId={verfahrenId}
          />
          <ProjectRouteDocumentTitle projectName={projectName} />
          <ProjectRunningWorkflowsWatcher />
          <ProjectRouteLayout />
          <PdfPopoutWorkspaceWindow />
        </PdfPopoutWorkspaceProvider>
      </ProjectGraphProvider>
    </Suspense>
  );
}

export const Route = createFileRoute('/verfahren/$verfahrenId')({
  component: ProjectRouteLayoutWithProviders,
  errorComponent: ProjectRouteErrorFallback,
  pendingComponent: ProjectRouteSkeleton,
  pendingMs: 0,
  shouldReload: false,
  validateSearch: layoutSearchSchema,

  loader: projectRouteLoader,
});
