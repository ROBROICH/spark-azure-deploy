import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UploadFile } from '../DocumentsUploadContext';
import { FileItemRow } from './FileItemRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/ui/tooltip/Tooltip', () => ({
  OverflowTooltip: (props: { children: React.ReactNode }) => props.children,
}));

const createUploadFile = (
  status: UploadFile['status'],
  errorReason?: UploadFile['errorReason'],
): UploadFile => ({
  id: `${status}-${errorReason ?? 'normal'}`,
  file: new File(['content'], 'documents.zip', { type: 'application/zip' }),
  status,
  errorReason,
});

describe('FileItemRow', () => {
  it.each([
    ['queued', createUploadFile('queued')],
    ['uploading', createUploadFile('uploading')],
    ['success', createUploadFile('success')],
    ['unsupported', createUploadFile('error', 'unsupported-format')],
    ['failed', createUploadFile('error', 'upload-failed')],
  ] as const)('exposes the %s status to assistive tech', (state, entry) => {
    render(<FileItemRow entry={entry} />);

    expect(
      screen.getByText(`Documents.updateDocuments.upload.status.${state}`),
    ).not.toBeNull();
  });
});
