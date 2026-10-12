import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

// The route component reads params and loader data through its route API;
// the test supplies them directly so no router mount is needed.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
  }),
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'test-project' }),
    useLoaderData: () => ({
      db: { nodesCollection: {} },
      projectName: 'Test project',
      projectVersion: 1,
    }),
  }),
}));

vi.mock('@/db/nodes/ProjectGraphProvider', () => ({
  ProjectGraphProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// The upload dialog subtree is the observable surface of the documents-upload
// provider; EWMS-only mode must not mount it, so plan-document dialogs cannot
// be restored from search state.
vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUpdateDialog',
  () => ({
    DocumentsUpdateDialog: () => <div>Documents update dialog</div>,
  }),
);
vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadContext',
  () => ({
    DocumentsUploadProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  }),
);
vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadToast',
  () => ({
    DocumentsUploadToast: () => <div>Documents upload toast</div>,
  }),
);
vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  PdfPopoutWorkspaceProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock(
  '@/features/project/pdf-popout/popout/PdfPopoutWorkspaceWindow',
  () => ({
    PdfPopoutWorkspaceWindow: () => null,
  }),
);
vi.mock(
  '@/features/workflow-runtime/workflow-status/ProjectRunningWorkflowsWatcher',
  () => ({
    ProjectRunningWorkflowsWatcher: () => null,
  }),
);
vi.mock('@/features/project/skeletons/ProjectRouteSkeleton', () => ({
  ProjectRouteSkeleton: () => <div>Loading project</div>,
}));
vi.mock('@/features/project/route/ProjectRouteErrorFallback', () => ({
  ProjectRouteErrorFallback: () => null,
}));
vi.mock('@/features/project/route/ProjectRouteLayout', () => ({
  ProjectRouteLayout: () => <div>Project layout content</div>,
}));
vi.mock('@/features/project/route/projectRouteLoader', () => ({
  projectRouteLoader: vi.fn(),
}));
vi.mock('@/features/project/route/ProjectVersionFreshnessCheck', () => ({
  ProjectVersionFreshnessCheck: () => null,
}));
vi.mock(
  '@/features/document-title/project-route-title/ProjectRouteDocumentTitle',
  () => ({
    ProjectRouteDocumentTitle: () => null,
  }),
);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the route module must load only after __APP_CONFIG__ is set.
const { Route } = await import('@/routes/verfahren/$verfahrenId/route');
const RouteComponent = Route.options.component as React.ComponentType;

afterEach(() => {
  cleanup();
});

describe('verfahren route providers in EWMS-only product mode', () => {
  it('does not mount the documents upload dialog or toast', () => {
    render(<RouteComponent />);

    expect(screen.queryByText('Documents update dialog')).toBeNull();
    expect(screen.queryByText('Documents upload toast')).toBeNull();
  });
});
