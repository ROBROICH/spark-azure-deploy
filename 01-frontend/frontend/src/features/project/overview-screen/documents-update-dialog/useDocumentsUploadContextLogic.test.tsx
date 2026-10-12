import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadZipResult } from './dialog-logic/useZipUpload';
import { UploadProgressStep } from './steps/UploadProgressStep';
import { useDocumentsUploadContextLogic } from './useDocumentsUploadContextLogic';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  uploadZip: vi.fn(),
  closeSideEffect: vi.fn(),
  processingFiles: [],
  workflowsManager: {},
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
    useLoaderData: () => ({ workflowsManager: mocks.workflowsManager }),
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({ canMutateProject: true }),
  }),
);
vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 1,
}));
vi.mock(
  '@/features/project/data/file-processing/useProcessingFilesQuery',
  () => ({
    useProcessingFilesQuery: () => ({ data: mocks.processingFiles }),
  }),
);
vi.mock('./dialog-logic/useApprovalActions', () => ({
  useApprovalActions: () => ({}),
}));
vi.mock('./dialog-logic/useApprovalInitializationBridge', () => ({
  useApprovalInitializationBridge: () => undefined,
}));
vi.mock('./dialog-logic/useDialogCloseAction', () => ({
  useDialogCloseAction: () => ({ runCloseSideEffect: mocks.closeSideEffect }),
}));
vi.mock('./dialog-logic/useUploadCompletionPolling', () => ({
  useUploadCompletionPolling: () => ({
    isProcessingComplete: false,
    isProcessingFailed: false,
  }),
}));
vi.mock('./dialog-logic/useZipUpload', () => ({
  useZipUpload: () => ({ isUploading: false, uploadZip: mocks.uploadZip }),
}));
vi.mock(import('./uploadWorkflow.helpers'), async (importOriginal) => ({
  ...(await importOriginal()),
  lookupOpenWorkflow: () => Promise.resolve(null),
}));
vi.mock('./DocumentsUploadContext', () => ({
  useDocumentsUploadContext: () => mocks.context(),
}));
vi.mock('./dialog-content/DialogShell', () => ({
  DialogShell: (props: {
    children: ReactNode;
    footer?: ReactNode;
    onMinimize: () => void;
  }) => (
    <div>
      <button onClick={props.onMinimize}>Minimize</button>
      {props.children}
      {props.footer}
    </div>
  ),
}));

describe('upload handshake cancellation', () => {
  beforeEach(() => {
    mocks.context.mockReset();
    mocks.uploadZip.mockReset();
    mocks.closeSideEffect.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('keeps the upload open until its ZIP identity is available, then closes without waiting for cancellation', async () => {
    let completeUpload: (result: UploadZipResult) => void = () => {
      throw new Error('Upload has not started');
    };
    mocks.uploadZip.mockImplementation(
      () =>
        new Promise<UploadZipResult>((resolve) => {
          completeUpload = resolve;
        }),
    );
    const { result } = renderHook(() => useDocumentsUploadContextLogic());
    await act(async () => result.current.openForProject('project-1'));
    act(() => result.current.addFiles([new File(['zip'], 'docs.zip')]));
    let upload: Promise<void> | undefined;
    act(() => {
      upload = result.current.startUpload();
    });

    act(() => result.current.close());
    expect(result.current.phase).toBe('uploading');
    expect(result.current.files).toHaveLength(1);
    expect(mocks.closeSideEffect).not.toHaveBeenCalled();
    act(() => result.current.minimize());
    expect(result.current.minimized).toBe(true);

    await act(async () => {
      completeUpload({ kind: 'success', zipFileId: 'zip-1' });
      await upload;
    });
    mocks.closeSideEffect.mockReturnValue(new Promise<void>(() => undefined));
    act(() => result.current.close());
    expect(result.current.phase).toBe('idle');
    expect(result.current.files).toEqual([]);
    expect(mocks.closeSideEffect).toHaveBeenCalledWith({
      phase: 'uploading',
      zipFileId: 'zip-1',
      projectId: 'project-1',
    });
  });

  it('offers minimization without cancellation throughout the upload', () => {
    const close = vi.fn();
    const minimize = vi.fn();
    mocks.context.mockReturnValue({ close, minimize, zipFileId: null });
    const { rerender } = render(<UploadProgressStep />);
    const cancel = () =>
      screen.queryByRole('button', {
        name: 'Documents.updateDocuments.uploading.cancel',
      });
    expect(cancel()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(minimize).toHaveBeenCalledTimes(1);

    mocks.context.mockReturnValue({ close, minimize, zipFileId: 'zip-1' });
    rerender(<UploadProgressStep />);
    expect(cancel()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(minimize).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
  });
});
