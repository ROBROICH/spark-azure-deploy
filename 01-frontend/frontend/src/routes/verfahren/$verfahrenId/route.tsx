import { ProjectGraphProvider } from '@/db/nodes/ProjectGraphProvider';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { ProjectRouteDocumentTitle } from '@/features/document-title/project-route-title/ProjectRouteDocumentTitle';
import { DocumentsUpdateDialog } from '@/features/project/overview-screen/documents-update-dialog/DocumentsUpdateDialog';
import { DocumentsUploadProvider } from '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadContext';
import { DocumentsUploadToast } from '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadToast';
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
  const effectiveMode = getConfiguredProductMode();

  const sharedProviders = (
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
  );

  return (
    <Suspense fallback={<ProjectRouteSkeleton />}>
      <ProjectGraphProvider key={verfahrenId} db={db}>
        {effectiveMode === 'ewms' ? (
          sharedProviders
        ) : (
          <DocumentsUploadProvider>
            {sharedProviders}
            <DocumentsUpdateDialog />
            <DocumentsUploadToast />
          </DocumentsUploadProvider>
        )}
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
