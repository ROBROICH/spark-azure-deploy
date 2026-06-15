import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDropZone } from './FileDropZone';

const baseProps = {
  selectedFile: null,
  onFileSelect: vi.fn(),
  onRemoveFile: vi.fn(),
  dropZoneTitle: 'Drop a file',
  dropZoneDescription: 'Drop here or choose a file.',
  formatHint: 'PDF only',
  chooseFileLabel: 'Choose file',
  removeFileLabel: 'Remove file',
  fileInputLabel: 'Upload file',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FileDropZone', () => {
  it('forwards accepted input files and resets the input for same-file reselection', () => {
    const file = new File(['pdf'], 'document.pdf', {
      type: 'application/pdf',
    });
    const onFileSelect = vi.fn();

    const { container } = render(
      <FileDropZone
        {...baseProps}
        accept=".pdf,application/pdf"
        onFileSelect={onFileSelect}
      />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [file] },
    });
    fireEvent.change(input, {
      target: { files: [file] },
    });

    expect(onFileSelect).toHaveBeenCalledTimes(2);
    expect(onFileSelect).toHaveBeenNthCalledWith(1, file);
    expect(onFileSelect).toHaveBeenNthCalledWith(2, file);
    expect(input.value).toBe('');
  });

  it('rejects input files that do not match the accept list', () => {
    const file = new File(['text'], 'document.txt', {
      type: 'text/plain',
    });
    const onFileSelect = vi.fn();
    const onRejectedFile = vi.fn();

    const { container } = render(
      <FileDropZone
        {...baseProps}
        accept=".pdf,application/pdf"
        onFileSelect={onFileSelect}
        onRejectedFile={onRejectedFile}
      />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [file] },
    });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onRejectedFile).toHaveBeenCalledWith(file);
  });

  it('forwards dropped files that match the accept list', () => {
    const file = new File(['pdf'], 'document.pdf', {
      type: 'application/pdf',
    });
    const onFileSelect = vi.fn();
    const onRejectedFile = vi.fn();

    const { container } = render(
      <FileDropZone
        {...baseProps}
        accept=".pdf,application/pdf"
        onFileSelect={onFileSelect}
        onRejectedFile={onRejectedFile}
      />,
    );

    const dropZone = container.querySelector('[data-slot="file-drop-zone"]');
    expect(dropZone).not.toBeNull();

    fireEvent.drop(dropZone as Element, {
      dataTransfer: { files: [file] },
    });

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(onRejectedFile).not.toHaveBeenCalled();
  });

  it('rejects dropped files that do not match the accept list', () => {
    const file = new File(['text'], 'document.txt', {
      type: 'text/plain',
    });
    const onFileSelect = vi.fn();
    const onRejectedFile = vi.fn();

    const { container } = render(
      <FileDropZone
        {...baseProps}
        accept=".pdf,application/pdf"
        onFileSelect={onFileSelect}
        onRejectedFile={onRejectedFile}
      />,
    );

    const dropZone = container.querySelector('[data-slot="file-drop-zone"]');
    expect(dropZone).not.toBeNull();

    fireEvent.drop(dropZone as Element, {
      dataTransfer: { files: [file] },
    });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onRejectedFile).toHaveBeenCalledWith(file);
  });

  it('selects only the first dropped file', () => {
    const firstFile = new File(['pdf'], 'first.pdf', {
      type: 'application/pdf',
    });
    const secondFile = new File(['pdf'], 'second.pdf', {
      type: 'application/pdf',
    });
    const onFileSelect = vi.fn();

    const { container } = render(
      <FileDropZone
        {...baseProps}
        accept=".pdf,application/pdf"
        onFileSelect={onFileSelect}
      />,
    );

    const dropZone = container.querySelector('[data-slot="file-drop-zone"]');
    expect(dropZone).not.toBeNull();

    fireEvent.drop(dropZone as Element, {
      dataTransfer: { files: [firstFile, secondFile] },
    });

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith(firstFile);
  });

  it('calls onRemoveFile from the selected file remove button', () => {
    const onRemoveFile = vi.fn();

    render(
      <FileDropZone
        {...baseProps}
        selectedFile={
          new File(['pdf'], 'document.pdf', { type: 'application/pdf' })
        }
        onFileSelect={vi.fn()}
        onRemoveFile={onRemoveFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));

    expect(onRemoveFile).toHaveBeenCalledTimes(1);
  });

  it('links upload errors to the file input and chooser button', () => {
    const { container } = render(
      <FileDropZone
        {...baseProps}
        uploadError="Upload failed"
        onFileSelect={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    const input = container.querySelector('input[type="file"]');
    const chooser = screen.getByRole('button', { name: 'Choose file' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(chooser).toHaveAttribute('aria-invalid', 'true');
    expect(chooser).toHaveAttribute('aria-describedby', alert.id);
  });
});
