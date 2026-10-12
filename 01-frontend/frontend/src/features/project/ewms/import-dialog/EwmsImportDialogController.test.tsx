import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EwmsImportDialogController } from './EwmsImportDialogController';
import type { EwmsZipUploadResult } from './uploadEwmsZip';

type MockEwmsFileImportDialogProps = {
  isImportStatusLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onProcessingStarted?: (processingWorkflow: {
    workflowId: string;
  }) => Promise<void> | void;
  onUploadStarted?: () => Promise<void> | void;
  onUploaded: (uploadResult: EwmsZipUploadResult) => Promise<void> | void;
  open: boolean;
};

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
  fileImportDialogProps: undefined as MockEwmsFileImportDialogProps | undefined,
  importDialogOpen: true,
  isEwmsFileImportWorkflowStateLoading: false,
  isEwmsFileImportWorkflowRunning: false,
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  observeStartedWorkflow: vi.fn(),
  refetch: vi.fn(),
  refetchRunning: vi.fn(),
  refetchQueries: vi.fn(),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('@/features/project/ewms/ewmsFeature', () => ({
  isEwmsFeatureEnabled: () => true,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    refetchQueries: mocks.refetchQueries,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: (routeId: string) =>
    routeId === '/verfahren/$verfahrenId'
      ? {
          useLoaderData: () => ({
            workflowsManager: {
              observeStartedWorkflow: mocks.observeStartedWorkflow,
              refetch: mocks.refetch,
              refetchRunning: mocks.refetchRunning,
            },
          }),
        }
      : {
          useNavigate: () => mocks.navigate,
          useParams: () => ({ verfahrenId: 'project-1' }),
          useSearch: () => ({
            importDialogOpen: mocks.importDialogOpen,
          }),
        },
}));

vi.mock('./EwmsFileImportDialog', () => ({
  EwmsFileImportDialog: (props: MockEwmsFileImportDialogProps) => {
    mocks.fileImportDialogProps = props;

    return (
      <div>
        dialog-open:{String(props.open)};status-loading:
        {String(props.isImportStatusLoading)}
      </div>
    );
  },
}));

const makeUploadResult = (): EwmsZipUploadResult => ({
  completedUpload: {
    bucketPath: 'ewms/ewms.zip',
    createdAt: '2026-05-19T00:00:00.000Z',
    filename: 'ewms.zip',
    id: 'zip-1',
    projectId: 'project-1',
    type: 'ewms_zip',
    updatedAt: '2026-05-19T00:00:00.000Z',
    workflowStatus: 'COMPLETED',
    approvalStatus: null,
    approvalError: null,
    workflowFailureCode: null,
    sourceProjectVersion: null,
  },
  fileReview: {
    failed: [],
    successful: [
      {
        fileId: 'file-1',
        filename: 'valid.pdf',
      },
    ],
  },
  processingWorkflowId: 'FileProcessingWorkflow-project-1',
});

const makeFailedOnlyUploadResult = (): EwmsZipUploadResult => ({
  ...makeUploadResult(),
  fileReview: {
    failed: [
      {
        code: 'ZIP_INVALID',
        filename: 'invalid.zip',
      },
    ],
    successful: [],
  },
});

const getImportJobState = () => ({
  isEwmsFileImportWorkflowRunning: mocks.isEwmsFileImportWorkflowRunning,
  isEwmsWorkflowRunning: false,
  isError: false,
  isFileProcessingWorkflowRunning: mocks.isEwmsFileImportWorkflowRunning,
  isLoading: mocks.isEwmsFileImportWorkflowStateLoading,
  latestRunningWorkflow: undefined,
});

const renderController = () =>
  render(<EwmsImportDialogController importJobState={getImportJobState()} />);

describe('EwmsImportDialogController', () => {
  beforeEach(() => {
    mocks.canMutateProject = true;
    mocks.fileImportDialogProps = undefined;
    mocks.importDialogOpen = true;
    mocks.isEwmsFileImportWorkflowStateLoading = false;
    mocks.isEwmsFileImportWorkflowRunning = false;
    mocks.invalidateQueries.mockClear();
    mocks.navigate.mockClear();
    mocks.observeStartedWorkflow.mockClear();
    mocks.refetch.mockClear();
    mocks.refetchRunning.mockClear();
    mocks.refetchQueries.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the dialog open when import is requested and no import workflow is running', () => {
    const { getByText } = renderController();

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps a URL-opened dialog visible while import workflow state is loading', () => {
    mocks.isEwmsFileImportWorkflowRunning = true;
    mocks.isEwmsFileImportWorkflowStateLoading = true;

    const { getByText } = renderController();

    expect(getByText('dialog-open:true;status-loading:true')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('clears URL-opened import dialog state while an import workflow is running', async () => {
    mocks.isEwmsFileImportWorkflowRunning = true;

    const { getByText } = renderController();

    expect(getByText('dialog-open:false;status-loading:false')).toBeTruthy();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      });
    });
  });

  it('closes the import dialog route state without adding browser history', () => {
    renderController();

    act(() => {
      mocks.fileImportDialogProps?.onOpenChange(false);
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      resetScroll: false,
      search: expect.any(Function),
    });
    const navigateArgs = mocks.navigate.mock.calls[0]?.[0] as {
      search: (search: { importDialogOpen?: boolean }) => {
        importDialogOpen?: boolean;
      };
    };
    expect(navigateArgs.search({ importDialogOpen: true })).toEqual({
      importDialogOpen: undefined,
    });
  });

  it('keeps the current upload review dialog open after it starts EWMS processing', async () => {
    const { getByText, rerender } = renderController();

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();

    await act(async () => {
      await mocks.fileImportDialogProps?.onProcessingStarted?.({
        workflowId: 'FileProcessingWorkflow-project-1',
      });
      await mocks.fileImportDialogProps?.onUploaded(makeUploadResult());
    });

    mocks.isEwmsFileImportWorkflowRunning = true;
    rerender(
      <EwmsImportDialogController importJobState={getImportJobState()} />,
    );

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps the current import dialog open once file processing starts', async () => {
    const { getByText, rerender } = renderController();

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();

    await act(async () => {
      await mocks.fileImportDialogProps?.onProcessingStarted?.({
        workflowId: 'FileProcessingWorkflow-project-1',
      });
    });

    mocks.isEwmsFileImportWorkflowRunning = true;
    rerender(
      <EwmsImportDialogController importJobState={getImportJobState()} />,
    );

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not create a fake EWMS observation when the review only contains failed files', async () => {
    const { getByText, rerender } = renderController();

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();

    await act(async () => {
      await mocks.fileImportDialogProps?.onUploaded(
        makeFailedOnlyUploadResult(),
      );
    });

    mocks.isEwmsFileImportWorkflowRunning = true;
    rerender(
      <EwmsImportDialogController importJobState={getImportJobState()} />,
    );

    expect(getByText('dialog-open:true;status-loading:false')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
