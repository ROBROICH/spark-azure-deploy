import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectVersionConflictDialog } from './ProjectVersionConflictDialog';

const mocks = vi.hoisted(() => ({
  experimentalRouteRemount: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/integrations/router/routeRemount', () => ({
  experimentalRouteRemount: mocks.experimentalRouteRemount,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const count = Number(params?.count);
      const translations: Record<string, string> = {
        'projectVersionConflictDialog.notLatest.title':
          'Outdated project version',
        'projectVersionConflictDialog.notLatest.description':
          'You are viewing or editing an outdated project version.',
        'projectVersionConflictDialog.notLatest.action':
          'Switch to the latest version',
        'projectVersionConflictDialog.versionLocked.title':
          'New project version is being created',
        'projectVersionConflictDialog.versionLocked.description':
          count === 1
            ? `A new project version is being created. This view will refresh in ${String(count)} second.`
            : `A new project version is being created. This view will refresh in ${String(count)} seconds.`,
        'projectVersionConflictDialog.versionLocked.action': 'Refresh now',
      };

      return translations[key] ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.experimentalRouteRemount.mockReset().mockResolvedValue(undefined);
});

describe('ProjectVersionConflictDialog', () => {
  it('remounts the project route when the not-latest action is clicked', async () => {
    render(
      <ProjectVersionConflictDialog kind="not_latest" projectId="project-1" />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to the latest version' }),
    );

    expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1');
  });

  it('calls onRecovered with the resolved project id only after remount resolves', async () => {
    let resolveRemount: (() => void) | undefined;
    mocks.experimentalRouteRemount.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRemount = resolve;
      }),
    );
    const onRecovered = vi.fn();

    render(
      <ProjectVersionConflictDialog
        kind="not_latest"
        projectId="project-1"
        onRecovered={onRecovered}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to the latest version' }),
    );

    expect(onRecovered).not.toHaveBeenCalled();

    await act(async () => {
      resolveRemount?.();
      await Promise.resolve();
    });

    expect(onRecovered).toHaveBeenCalledWith('project-1');
  });

  it.each(['not_latest', 'version_locked'] as const)(
    'does not dismiss %s conflicts with escape or outside interaction',
    async (kind) => {
      const user = userEvent.setup();

      render(
        <ProjectVersionConflictDialog kind={kind} projectId="project-1" />,
      );

      await user.keyboard('{Escape}');
      fireEvent.pointerDown(document.body);

      expect(screen.getByRole('dialog')).not.toBeNull();
    },
  );

  it('does not render a close affordance for not-latest conflicts', () => {
    render(
      <ProjectVersionConflictDialog kind="not_latest" projectId="project-1" />,
    );

    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Switch to the latest version' }),
    ).not.toBeNull();
  });

  it('exposes a keyboard-operable refresh action for locked conflicts', async () => {
    const user = userEvent.setup();

    render(
      <ProjectVersionConflictDialog
        kind="version_locked"
        projectId="project-1"
      />,
    );

    const refreshButton = screen.getByRole('button', { name: 'Refresh now' });
    expect(refreshButton).not.toBeNull();

    // The locked dialog must remain keyboard-operable: the action can be
    // focused and activated without a pointer.
    await user.tab();
    expect(document.activeElement).toBe(refreshButton);

    await user.keyboard('{Enter}');
    expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1');
  });

  it('shows a singular seconds label at one second remaining', async () => {
    vi.useFakeTimers();

    render(
      <ProjectVersionConflictDialog
        kind="version_locked"
        projectId="project-1"
      />,
    );

    expect(screen.getByText(/15 seconds/)).not.toBeNull();

    for (let tick = 0; tick < 14; tick += 1) {
      // eslint-disable-next-line no-await-in-loop -- each timer tick schedules the next countdown render before the following second can elapse.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    expect(screen.getByText(/1 second\b/)).not.toBeNull();
    expect(screen.queryByText(/1 seconds/)).toBeNull();
  });

  it('counts down locked conflicts and automatically remounts at zero', async () => {
    vi.useFakeTimers();

    render(
      <ProjectVersionConflictDialog
        kind="version_locked"
        projectId="project-1"
      />,
    );

    expect(screen.getByText(/15 seconds/)).not.toBeNull();

    for (let tick = 0; tick < 15; tick += 1) {
      // eslint-disable-next-line no-await-in-loop -- each timer tick schedules the next countdown render before the following second can elapse.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1');
    expect(screen.getByText(/0 seconds/)).not.toBeNull();
  });
});
