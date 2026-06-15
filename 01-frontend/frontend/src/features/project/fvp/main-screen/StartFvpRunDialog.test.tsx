import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import type * as ProjectVersioning from '@/features/project/versioning/projectVersioning';
import { StartFvpRunDialog } from './StartFvpRunDialog';

const mocks = vi.hoisted(() => ({
  experimentalRouteRemount: vi.fn(() => Promise.resolve()),
  onClose: vi.fn(() => Promise.resolve()),
  startFvpWorkflow: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useStartFvpWorkflow',
  () => ({
    useStartFvpWorkflow: () => ({
      isStartingFvpWorkflow: false,
      startFvpWorkflow: mocks.startFvpWorkflow,
    }),
  }),
);

vi.mock('@/integrations/router/routeRemount', () => ({
  experimentalRouteRemount: mocks.experimentalRouteRemount,
}));

vi.mock(
  '@/features/project/versioning/projectVersioning',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ProjectVersioning>()),
    useProjectRouteVersion: () => 3,
  }),
);

afterEach(() => {
  cleanup();
  mocks.experimentalRouteRemount.mockClear();
  mocks.onClose.mockClear();
  mocks.startFvpWorkflow.mockClear();
});

describe('StartFvpRunDialog', () => {
  it('remounts the project route after starting and closing the dialog', async () => {
    const user = userEvent.setup();

    render(
      <StartFvpRunDialog
        canStartProcess
        open
        verfahrenId="project-1"
        onClose={mocks.onClose}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'redesign.startDialog.confirm',
      }),
    );

    expect(mocks.startFvpWorkflow).toHaveBeenCalledOnce();
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1');
    expect(mocks.onClose.mock.invocationCallOrder.at(0)).toBeLessThan(
      mocks.experimentalRouteRemount.mock.invocationCallOrder.at(0) ?? 0,
    );
  });

  it('keeps the dialog open without an error when a handled version conflict is thrown', async () => {
    const user = userEvent.setup();
    mocks.startFvpWorkflow.mockRejectedValueOnce(
      createHandledProjectVersionConflictError(),
    );

    render(
      <StartFvpRunDialog
        canStartProcess
        open
        verfahrenId="project-1"
        onClose={mocks.onClose}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'redesign.startDialog.confirm',
      }),
    );

    expect(mocks.startFvpWorkflow).toHaveBeenCalledOnce();
    // Handled version conflicts are surfaced by the shared conflict dialog, so
    // this dialog must not show its own generic error message.
    expect(
      screen.queryByText('redesign.startDialog.error'),
    ).not.toBeInTheDocument();
    // The catch returns early: the dialog is neither closed nor remounted.
    expect(mocks.onClose).not.toHaveBeenCalled();
    expect(mocks.experimentalRouteRemount).not.toHaveBeenCalled();
  });

  it('shows the error message and keeps the dialog open on a generic rejection', async () => {
    const user = userEvent.setup();
    mocks.startFvpWorkflow.mockRejectedValueOnce(new Error('network down'));

    render(
      <StartFvpRunDialog
        canStartProcess
        open
        verfahrenId="project-1"
        onClose={mocks.onClose}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'redesign.startDialog.confirm',
      }),
    );

    expect(mocks.startFvpWorkflow).toHaveBeenCalledOnce();
    // A generic failure surfaces the inline error alert and leaves the dialog open.
    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('redesign.startDialog.error');
    // The workflow did not start, so no close or route remount should happen.
    expect(mocks.onClose).not.toHaveBeenCalled();
    expect(mocks.experimentalRouteRemount).not.toHaveBeenCalled();
  });
});
