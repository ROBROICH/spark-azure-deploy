import { fireEvent, screen } from '@testing-library/react';
import { expect } from 'vitest';

type UploadStepLabels = {
  chooseFile: string;
  dropZoneTitle: string;
  fileInput: string;
  next: string;
  removeFile: string;
};

const getDropZone = (dropZoneTitle: string) => {
  const dropZone = screen
    .getByText(dropZoneTitle)
    .closest('div')?.parentElement;

  if (!dropZone) {
    throw new Error('Drop zone not found');
  }

  return dropZone;
};

export const expectFileSelectionBlocked = (
  labels: Pick<
    UploadStepLabels,
    'chooseFile' | 'dropZoneTitle' | 'fileInput' | 'next'
  >,
  selectedFile: File,
  onFileSelect: () => void,
) => {
  const fileInput = screen.getByLabelText(labels.fileInput);
  const chooseButton = screen.getByRole('button', {
    name: labels.chooseFile,
  });
  const nextButton = screen.getByRole('button', {
    name: labels.next,
  });

  expect(fileInput).toHaveProperty('disabled', true);
  expect(chooseButton).toHaveProperty('disabled', true);
  expect(nextButton).toHaveProperty('disabled', true);

  fireEvent.change(fileInput, { target: { files: [selectedFile] } });
  fireEvent.drop(getDropZone(labels.dropZoneTitle), {
    dataTransfer: { files: [selectedFile] },
  });

  expect(onFileSelect).not.toHaveBeenCalled();
};

export const expectRemoveAndSubmitBlocked = (
  labels: Pick<UploadStepLabels, 'next' | 'removeFile'>,
  onRemoveFile: () => void,
  onSubmit: () => void,
) => {
  const removeButton = screen.getByRole('button', {
    name: labels.removeFile,
  });
  const nextButton = screen.getByRole('button', {
    name: labels.next,
  });

  expect(removeButton).toHaveProperty('disabled', true);
  expect(nextButton).toHaveProperty('disabled', true);

  fireEvent.click(removeButton);
  fireEvent.click(nextButton);

  expect(onRemoveFile).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
};
