import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  expectFileSelectionBlocked,
  expectRemoveAndSubmitBlocked,
} from '../test/fileUploadStepTestAssertions';
import { FileUploadStep } from './FileUploadStep';

const labels = {
  chooseFile: 'importDialog.chooseFile',
  dropZoneTitle: 'importDialog.dropZoneTitle',
  fileInput: 'importDialog.fileInputLabel',
  next: 'importDialog.next',
  removeFile: 'importDialog.removeFile',
};

const renderWithTooltipProvider = (node: ReactNode) =>
  render(<TooltipProvider>{node}</TooltipProvider>);

const renderFileUploadStep = (
  props: Partial<ComponentProps<typeof FileUploadStep>> = {},
) =>
  render(
    <FileUploadStep
      fileInputRef={createRef<HTMLInputElement>()}
      isSystemLoadStartBlocked={false}
      isSystemLoadStartLoading={false}
      selectedFile={null}
      showSystemLoadStartTooltip={false}
      systemLoadDisableThresholdPercentage={500}
      uploadError={null}
      onCancel={() => undefined}
      onFileSelect={() => undefined}
      onRemoveFile={() => undefined}
      onSubmit={() => undefined}
      {...props}
    />,
  );

afterEach(() => {
  resetProjectPermissionTestMocks();
  cleanup();
});

describe('FileUploadStep permissions', () => {
  it('disables and ignores file selection when project mutation is denied', () => {
    setProjectCanMutate(false);
    const onFileSelect = vi.fn();
    const selectedFile = new File(['zip'], 'ewms.zip', {
      type: 'application/zip',
    });

    renderFileUploadStep({ onFileSelect });

    expectFileSelectionBlocked(labels, selectedFile, onFileSelect);
  });

  it('disables and ignores remove and submit when project mutation is denied', () => {
    setProjectCanMutate(false);
    const onRemoveFile = vi.fn();
    const onSubmit = vi.fn();

    renderFileUploadStep({
      selectedFile: new File(['zip'], 'ewms.zip', {
        type: 'application/zip',
      }),
      onRemoveFile,
      onSubmit,
    });

    expectRemoveAndSubmitBlocked(labels, onRemoveFile, onSubmit);
  });

  it('guards the initial import button with the system-load tooltip', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithTooltipProvider(
      <FileUploadStep
        fileInputRef={createRef<HTMLInputElement>()}
        isSystemLoadStartBlocked
        isSystemLoadStartLoading={false}
        selectedFile={
          new File(['zip'], 'ewms.zip', { type: 'application/zip' })
        }
        showSystemLoadStartTooltip
        systemLoadDisableThresholdPercentage={500}
        uploadError={null}
        onCancel={() => undefined}
        onFileSelect={() => undefined}
        onRemoveFile={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    const nextButton = screen.getByRole('button', {
      name: 'importDialog.next',
    });
    const tooltipTrigger = nextButton.parentElement;

    if (!tooltipTrigger) {
      throw new Error('Expected system-load tooltip trigger to exist.');
    }

    expect(nextButton).toHaveProperty('disabled', true);

    fireEvent.click(nextButton);
    await user.hover(tooltipTrigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain(
      'projectNavbar.startProcessDisabledBySystemLoad',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
