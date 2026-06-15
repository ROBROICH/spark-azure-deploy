import { render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UploadStep } from './UploadStep';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../dialog-content/DialogShell', () => ({
  DialogShell: (props: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {props.children}
      {props.footer}
    </div>
  ),
}));

vi.mock('../DocumentsUploadContext', () => ({
  useDocumentsUploadContext: () => ({
    addFiles: () => undefined,
    close: () => undefined,
    files: [],
    globalError: null,
    isUploading: false,
    startUpload: () => undefined,
  }),
}));

describe('UploadStep', () => {
  it('limits the native file picker to ZIP files', () => {
    const { container } = render(<UploadStep />);
    const input = container.querySelector('input[type="file"]');

    expect(input?.getAttribute('accept')).toBe('.zip');
  });
});
