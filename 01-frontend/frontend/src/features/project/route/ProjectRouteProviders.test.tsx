import { render, within } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Route } from '@/routes/verfahren/$verfahrenId/route';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  getRouteApi: () => ({
    useLoaderData: () => ({
      db: {},
      projectName: 'Testverfahren',
      projectVersion: 1,
    }),
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
  }),
}));

vi.mock('@/db/nodes/ProjectGraphProvider', () => ({
  ProjectGraphProvider: (props: { children: ReactNode }) => (
    <div data-testid="project-graph-provider">{props.children}</div>
  ),
}));

vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadContext',
  () => ({
    DocumentsUploadProvider: (props: { children: ReactNode }) => (
      <div data-testid="documents-upload-provider">{props.children}</div>
    ),
  }),
);

vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUpdateDialog',
  () => ({
    DocumentsUpdateDialog: () => <div>documents-update-dialog</div>,
  }),
);

vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadToast',
  () => ({
    DocumentsUploadToast: () => <div>documents-upload-toast</div>,
  }),
);

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  PdfPopoutWorkspaceProvider: (props: { children: ReactNode }) => (
    <>{props.children}</>
  ),
}));

vi.mock(
  '@/features/project/pdf-popout/popout/PdfPopoutWorkspaceWindow',
  () => ({ PdfPopoutWorkspaceWindow: () => null }),
);

vi.mock('@/features/project/route/ProjectRouteLayout', () => ({
  ProjectRouteLayout: () => <div>project-route-layout</div>,
}));

vi.mock('@/features/project/route/ProjectVersionFreshnessCheck', () => ({
  ProjectVersionFreshnessCheck: () => null,
}));

vi.mock('@/features/project/route/projectRouteLoader', () => ({
  projectRouteLoader: vi.fn(),
}));

vi.mock(
  '@/features/document-title/project-route-title/ProjectRouteDocumentTitle',
  () => ({ ProjectRouteDocumentTitle: () => null }),
);

vi.mock(
  '@/features/workflow-runtime/workflow-status/ProjectRunningWorkflowsWatcher',
  () => ({ ProjectRunningWorkflowsWatcher: () => null }),
);

vi.mock('@/features/project/skeletons/ProjectRouteSkeleton', () => ({
  ProjectRouteSkeleton: () => null,
}));

vi.mock('@/features/project/route/ProjectRouteErrorFallback', () => ({
  ProjectRouteErrorFallback: () => null,
}));

describe('/verfahren/$verfahrenId route', () => {
  it('owns the document approval workflow for every nested project page', () => {
    const ProjectRoute = (Route as unknown as { component: ComponentType })
      .component;

    const { getByTestId } = render(<ProjectRoute />);
    const uploadProvider = getByTestId('documents-upload-provider');

    expect(
      within(uploadProvider).getByText('project-route-layout'),
    ).toBeTruthy();
    expect(
      within(uploadProvider).getByText('documents-update-dialog'),
    ).toBeTruthy();
    expect(
      within(uploadProvider).getByText('documents-upload-toast'),
    ).toBeTruthy();
  });
});
