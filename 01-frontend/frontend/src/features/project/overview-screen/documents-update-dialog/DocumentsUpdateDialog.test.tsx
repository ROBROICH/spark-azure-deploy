import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsUpdateDialog } from './DocumentsUpdateDialog';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
  phase: 'diff',
}));

vi.mock('@/features/ui/dialog/Dialog', () => ({
  Dialog: (props: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.onOpenChange = props.onOpenChange;
    return <>{props.children}</>;
  },
}));

vi.mock('./DocumentsUploadContext', () => ({
  useDocumentsUploadContext: () => ({
    close: mocks.close,
    minimized: false,
    phase: mocks.phase,
  }),
}));

vi.mock('./steps/ApprovalInitializingStep', () => ({
  ApprovalInitializingStep: () => null,
}));
vi.mock('./steps/AiProcessesStep', () => ({ AiProcessesStep: () => null }));
vi.mock('./steps/DocumentDiffStep', () => ({
  DocumentDiffStep: () => <div>document-diff</div>,
}));
vi.mock('./steps/UploadProgressStep', () => ({
  UploadProgressStep: () => null,
}));
vi.mock('./steps/UploadStep', () => ({ UploadStep: () => null }));
vi.mock('./steps/UploadSuccessStep', () => ({
  UploadSuccessStep: () => null,
}));

describe('DocumentsUpdateDialog', () => {
  beforeEach(() => {
    mocks.close.mockReset();
    mocks.onOpenChange = undefined;
    mocks.phase = 'diff';
  });

  it('ignores external close requests while a ZIP approval decision is pending', () => {
    const { rerender } = render(<DocumentsUpdateDialog />);

    act(() => mocks.onOpenChange?.(false));

    expect(mocks.close).not.toHaveBeenCalled();

    mocks.phase = 'selecting';
    rerender(<DocumentsUpdateDialog />);
    act(() => mocks.onOpenChange?.(false));

    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
