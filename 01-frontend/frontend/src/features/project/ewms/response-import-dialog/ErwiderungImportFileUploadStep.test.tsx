import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { afterEach, describe, it, vi } from 'vitest';
import {
  expectFileSelectionBlocked,
  expectRemoveAndSubmitBlocked,
} from '../test/fileUploadStepTestAssertions';
import { ErwiderungImportFileUploadStep } from './ErwiderungImportFileUploadStep';

const labels = {
  chooseFile: 'responseImportDialog.chooseFile',
  dropZoneTitle: 'responseImportDialog.dropZoneTitle',
  fileInput: 'responseImportDialog.fileInputLabel',
  next: 'responseImportDialog.next',
  removeFile: 'responseImportDialog.removeFile',
};

const renderErwiderungFileUploadStep = (
  props: Partial<ComponentProps<typeof ErwiderungImportFileUploadStep>> = {},
) =>
  render(
    <ErwiderungImportFileUploadStep
      fileInputRef={createRef<HTMLInputElement>()}
      onCancel={() => undefined}
      onFileSelect={() => undefined}
      onRemoveFile={() => undefined}
      onSubmit={() => undefined}
      selectedFile={null}
      uploadError={null}
      {...props}
    />,
  );

afterEach(() => {
  resetProjectPermissionTestMocks();
  cleanup();
});

describe('ErwiderungImportFileUploadStep permissions', () => {
  it('disables and ignores file selection when project mutation is denied', () => {
    const selectedFile = new File(['csv'], 'erwiderungen.csv', {
      type: 'text/csv',
    });
    const onFileSelect = vi.fn();
    setProjectCanMutate(false);

    renderErwiderungFileUploadStep({ onFileSelect });

    expectFileSelectionBlocked(labels, selectedFile, onFileSelect);
  });

  it('disables and ignores remove and submit when project mutation is denied', () => {
    const onSubmit = vi.fn();
    const onRemoveFile = vi.fn();
    setProjectCanMutate(false);

    renderErwiderungFileUploadStep({
      selectedFile: new File(['csv'], 'erwiderungen.csv', {
        type: 'text/csv',
      }),
      onRemoveFile,
      onSubmit,
    });

    expectRemoveAndSubmitBlocked(labels, onRemoveFile, onSubmit);
  });
});
