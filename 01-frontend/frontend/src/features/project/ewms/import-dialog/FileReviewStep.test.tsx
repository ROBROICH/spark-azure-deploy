import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileReviewStep } from './FileReviewStep';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const renderWithTooltipProvider = (node: ReactNode) =>
  render(<TooltipProvider>{node}</TooltipProvider>);

describe('FileReviewStep', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows duplicate file errors as the duplicate badge', () => {
    render(
      <FileReviewStep
        fileReview={{
          failed: [
            {
              code: 'FILE_UPLOAD_ERROR',
              filename: 'duplicates/einwendung.pdf',
              reason:
                'Duplicate file detected - matches existing file 769d9eaa-0248-4427-8674-d2e20c365eae',
            },
          ],
          successful: [],
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText('fileReviewPage.failureReasons.duplicate'),
    ).not.toBeNull();
    expect(screen.queryByText(/Duplicate file detected/)).toBeNull();
  });

  it('shows invalid filename errors with a tooltip', async () => {
    const user = userEvent.setup();

    renderWithTooltipProvider(
      <FileReviewStep
        fileReview={{
          failed: [
            {
              code: 'INVALID_FILENAME',
              filename: 'invalid-name.pdf',
            },
          ],
          successful: [],
        }}
        onClose={() => undefined}
      />,
    );

    const invalidFilenameBadge = screen.getByText(
      'fileReviewPage.failureReasons.invalidFilename',
    );

    await user.hover(invalidFilenameBadge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain(
      'fileReviewPage.failureReasonTooltips.invalidFilename',
    );
  });

  it('shows unsupported file type errors as a specific badge', () => {
    render(
      <FileReviewStep
        fileReview={{
          failed: [
            {
              code: 'UNSUPPORTED_FILETYPE',
              filename: 'einwendung.docx',
            },
          ],
          successful: [],
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText('fileReviewPage.failureReasons.unsupportedFiletype'),
    ).not.toBeNull();
  });
});
