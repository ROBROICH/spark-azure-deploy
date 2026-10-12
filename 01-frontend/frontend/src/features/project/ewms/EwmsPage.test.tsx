import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EwmsPage } from './EwmsPage';

const mocks = vi.hoisted(() => ({
  useGraph: vi.fn(),
  useEwmsImportJobState: vi.fn(),
  useEwmsWorkflowDataRefresh: vi.fn(),
}));

vi.mock('@/db/nodes/ProjectGraphProvider', () => ({
  useGraph: mocks.useGraph,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
  }),
}));

vi.mock('@/features/project/ewms/ewmsFeature', () => ({
  isEwmsFeatureEnabled: () => true,
}));

vi.mock('./useEwmsImportJobState', () => ({
  useEwmsImportJobState: mocks.useEwmsImportJobState,
}));

vi.mock('./workspace/useEwmsWorkflowDataRefresh', () => ({
  useEwmsWorkflowDataRefresh: mocks.useEwmsWorkflowDataRefresh,
}));

vi.mock('./import-dialog/EwmsImportDialogController', () => ({
  EwmsImportDialogController: () => <div>import-dialog</div>,
}));

vi.mock('./landing/EwmsLandingPage', () => ({
  EwmsLandingPage: () => <div>landing</div>,
}));

vi.mock('./response-import-dialog/ErwiderungImportDialogController', () => ({
  ErwiderungImportDialogController: () => <div>response-import-dialog</div>,
}));

vi.mock('./workspace/EwmsLoadingPage', () => ({
  EwmsLoadingPage: (props: { workflow?: { workflowId?: string } }) => (
    <div>loading-page:{props.workflow?.workflowId ?? 'fallback'}</div>
  ),
}));

vi.mock('./workspace/EwmsSubtopicsContext', () => ({
  EwmsSubtopicsProvider: (props: { children: ReactNode }) => (
    <>{props.children}</>
  ),
}));

vi.mock('./workspace/EwmsWorkspace', () => ({
  EwmsWorkspace: () => <div>workspace</div>,
}));

vi.mock('./workspace/EwmsWorkspaceSkeleton', () => ({
  EwmsWorkspaceSkeleton: () => <div>workspace-skeleton</div>,
}));

describe('EwmsPage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.useGraph.mockReset();
    mocks.useGraph.mockReturnValue({
      getNodesByType: () => [],
    });
    mocks.useEwmsImportJobState.mockReset();
    mocks.useEwmsImportJobState.mockReturnValue({
      isEwmsFileImportWorkflowRunning: true,
      isError: false,
      isFileProcessingWorkflowRunning: false,
      isLoading: false,
      isEwmsWorkflowRunning: true,
      latestRunningWorkflow: {
        status: 'running',
        workflowId: '8dfec4e0-3669-487d-9ce0-a25b5abaccb0',
      },
    });
    mocks.useEwmsWorkflowDataRefresh.mockReset();
  });

  it('uses the EWMS import job state in the current project scope', () => {
    const { getByText } = render(<EwmsPage />);

    expect(mocks.useEwmsImportJobState).toHaveBeenCalledWith('verfahren-1');
    expect(mocks.useEwmsWorkflowDataRefresh).toHaveBeenCalledWith({
      isEwmsWorkflowRunning: true,
      projectId: 'verfahren-1',
      shouldRefreshProcessingData: true,
    });
    expect(
      getByText('loading-page:8dfec4e0-3669-487d-9ce0-a25b5abaccb0'),
    ).toBeTruthy();
  });

  it('shows landing when no EWMS data exists and no workflow is running', () => {
    mocks.useEwmsImportJobState.mockReturnValue({
      isEwmsFileImportWorkflowRunning: false,
      isError: false,
      isFileProcessingWorkflowRunning: false,
      isLoading: false,
      isEwmsWorkflowRunning: false,
      latestRunningWorkflow: undefined,
    });

    const { getByText, queryByText } = render(<EwmsPage />);

    expect(getByText('landing')).toBeTruthy();
    expect(queryByText(/workspace/)).toBeNull();
    expect(queryByText(/loading-page/)).toBeNull();
  });

  it('keeps initial import on landing while only file processing is running', () => {
    mocks.useEwmsImportJobState.mockReturnValue({
      isEwmsFileImportWorkflowRunning: true,
      isError: false,
      isFileProcessingWorkflowRunning: true,
      isLoading: false,
      isEwmsWorkflowRunning: false,
      latestRunningWorkflow: undefined,
    });

    const { getByText, queryByText } = render(<EwmsPage />);

    expect(getByText('landing')).toBeTruthy();
    expect(queryByText(/loading-page/)).toBeNull();
  });

  it('keeps the workspace visible when additional EWMS data is being processed', () => {
    mocks.useGraph.mockReturnValue({
      getNodesByType: () => [
        { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
      ],
    });
    mocks.useEwmsImportJobState.mockReturnValue({
      isEwmsFileImportWorkflowRunning: true,
      isError: false,
      isFileProcessingWorkflowRunning: false,
      isLoading: false,
      isEwmsWorkflowRunning: true,
      latestRunningWorkflow: {
        runId: 'run-additional',
        status: 'running',
        workflowId: '8dfec4e0-3669-487d-9ce0-a25b5abaccb0',
      },
    });

    const { getByText, queryByText } = render(<EwmsPage />);

    expect(getByText('workspace')).toBeTruthy();
    expect(queryByText('loading-page')).toBeNull();
  });
});
