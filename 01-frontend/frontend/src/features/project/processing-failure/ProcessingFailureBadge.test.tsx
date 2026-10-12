import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { ProcessingFailureBadge } from './ProcessingFailureBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { area?: string; subject?: string }) =>
      values?.area === undefined
        ? key
        : `${key}(${[values.area, values.subject].filter(Boolean).join(', ')})`,
  }),
}));

const renderBadge = (errorCode: string) =>
  render(
    <ProcessingFailureBadge
      area="plausibility"
      // An unknown code can reach the client from a newer backend.
      errorCode={errorCode as WorkflowFailureCode}
    />,
  );

const chip = () =>
  screen.getByRole('button', { name: 'processingFailure.areas.plausibility' });

describe('ProcessingFailureBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the area and the mapped cause on hover', async () => {
    renderBadge('ANALYSIS_TIMED_OUT');

    await userEvent.hover(chip());

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('processingFailure.areas.plausibility');
    expect(tooltip).toHaveTextContent(
      'Documents.processingFailureReasons.ANALYSIS_TIMED_OUT',
    );
  });

  it('shows the cause to keyboard users on focus', async () => {
    renderBadge('ANALYSIS_TIMED_OUT');

    await userEvent.tab();

    expect(chip()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Documents.processingFailureReasons.ANALYSIS_TIMED_OUT',
    );
  });

  it('shows the generic cause for an unknown code and never the code itself', async () => {
    renderBadge('FVPWorkflow crashed');

    await userEvent.hover(chip());

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Documents.processingFailureReasons.ANALYSIS_FAILED',
    );
    expect(tooltip).not.toHaveTextContent('FVPWorkflow crashed');
  });

  it('names the affected item when a subject is given', () => {
    render(
      <ProcessingFailureBadge
        area="mvpNorm"
        errorCode="ANALYSIS_FAILED"
        subject="§ 44 BNatSchG"
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'processingFailure.badge.ariaLabelWithSubject(processingFailure.areas.mvpNorm, § 44 BNatSchG)',
      }),
    ).toBeInTheDocument();
  });
});
