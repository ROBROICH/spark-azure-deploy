import { emitSessionExpired } from '@/features/access-control/current-user/sessionExpired';
import { emitProjectVersionConflict } from '@/features/project/versioning/conflict-dialogs/projectVersionConflict';
import { createAuthRedirectAwareFetch } from '@/integrations/api-clients/configureClients';
import { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTanstackErrorTelemetry,
  Provider,
  queryClient,
} from './root-provider';

const mocks = vi.hoisted(() => ({
  mountedProjectIds: new Set<string>(),
  lastOnRecovered: undefined as
    | ((recoveredProjectId: string) => void)
    | undefined,
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  getMountedProjectIds: () => mocks.mountedProjectIds,
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/SessionExpiredDialog', () => ({
  SessionExpiredDialog: (props: { open: boolean }) =>
    props.open ? <div role="dialog">Session expired</div> : null,
}));

vi.mock(
  '@/features/project/versioning/conflict-dialogs/ProjectVersionConflictDialog',
  () => ({
    ProjectVersionConflictDialog: (props: {
      kind: string;
      projectId: string;
      onRecovered?: (recoveredProjectId: string) => void;
    }) => {
      mocks.lastOnRecovered = props.onRecovered;
      return (
        <div role="dialog" data-project-id={props.projectId}>
          Project version conflict: {props.kind} ({props.projectId})
          <button
            type="button"
            onClick={() => props.onRecovered?.(props.projectId)}
          >
            recover
          </button>
        </div>
      );
    },
  }),
);

beforeEach(() => {
  mocks.mountedProjectIds = new Set<string>();
  mocks.lastOnRecovered = undefined;
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.mocked(Sentry.captureException).mockClear();
});

describe('Provider', () => {
  it('opens the session-expired dialog when the transport event fires', async () => {
    const client = new QueryClient();

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();

    emitSessionExpired();

    await waitFor(() => {
      expect(screen.getByRole('dialog')).not.toBeNull();
    });
  });

  it('opens the session-expired dialog when an API client receives an auth redirect', async () => {
    const client = new QueryClient();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302 }));
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    await wrappedFetch('/api/test');

    await waitFor(() => {
      expect(screen.getByRole('dialog')).not.toBeNull();
    });
  });

  it('keeps a locked project-version conflict active when a not-latest conflict fires afterward', async () => {
    mocks.mountedProjectIds = new Set(['project-1']);
    const client = new QueryClient();

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    emitProjectVersionConflict({
      kind: 'version_locked',
      projectId: 'project-1',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain(
        'version_locked',
      );
    });

    emitProjectVersionConflict({
      kind: 'not_latest',
      projectId: 'project-1',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain(
        'version_locked',
      );
    });
  });

  it('ignores conflict events for projects that are not currently mounted', async () => {
    mocks.mountedProjectIds = new Set(['project-1']);
    const client = new QueryClient();

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    emitProjectVersionConflict({
      kind: 'not_latest',
      projectId: 'foreign-project',
    });

    // Give the event a microtask to propagate, then assert nothing rendered.
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not let a stale recovery for one project clear a conflict for another', async () => {
    mocks.mountedProjectIds = new Set(['project-a', 'project-b']);
    const client = new QueryClient();

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    emitProjectVersionConflict({
      kind: 'not_latest',
      projectId: 'project-a',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain('project-a');
    });

    // A newer conflict for project-b replaces the visible conflict.
    emitProjectVersionConflict({
      kind: 'not_latest',
      projectId: 'project-b',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain('project-b');
    });

    // Simulate a stale recovery completing for project-a after project-b's
    // conflict became active. The identity-aware guard must keep project-b.
    await act(async () => {
      mocks.lastOnRecovered?.('project-a');
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog').getAttribute('data-project-id')).toBe(
      'project-b',
    );
  });

  it('clears the conflict when recovery matches the active project', async () => {
    mocks.mountedProjectIds = new Set(['project-a']);
    const client = new QueryClient();

    render(
      <Provider queryClient={client}>
        <div>App</div>
      </Provider>,
    );

    emitProjectVersionConflict({
      kind: 'not_latest',
      projectId: 'project-a',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain('project-a');
    });

    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'recover' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('createTanstackErrorTelemetry', () => {
  it('keeps only allowlisted generated query-key fields', () => {
    expect(
      createTanstackErrorTelemetry(
        'query',
        [
          {
            _id: 'getProject',
            _infinite: true,
            baseUrl: 'https://dashboard.example.test/api',
            body: { title: 'User-entered project title' },
            headers: { authorization: 'Bearer token' },
            path: { projectId: 'cf16e372-f7fc-402d-b5cb-c28733c3410a' },
            query: { search: 'User-entered search text' },
            tags: ['Projects', 'unsafe tag with spaces'],
          },
        ],
        Object.assign(new TypeError('User-entered project title leaked here'), {
          status: 403,
        }),
      ),
    ).toEqual({
      kind: 'query',
      operationId: 'getProject',
      infinite: true,
      errorName: 'TypeError',
      httpStatus: 403,
    });
  });

  it('drops non-generated mutation keys', () => {
    expect(
      createTanstackErrorTelemetry(
        'mutation',
        ['updateProject', 'cf16e372-f7fc-402d-b5cb-c28733c3410a'],
        { statusCode: 409, detail: 'User-entered project title' },
      ),
    ).toEqual({
      kind: 'mutation',
      httpStatus: 409,
      nonErrorThrownKeys: ['detail', 'statusCode'],
      nonErrorThrownType: 'object',
    });
  });

  it('marks empty non-Error thrown objects without sending raw values', () => {
    expect(
      createTanstackErrorTelemetry('query', ['required-documents'], {}),
    ).toEqual({
      kind: 'query',
      nonErrorThrownType: 'empty-object',
    });
  });
});

describe('queryClient error reporting', () => {
  it('captures empty object query failures as a real Error', async () => {
    const thrownValue = {};

    await expect(
      queryClient.fetchQuery({
        queryKey: [
          {
            _id: 'getRequiredDocumentTypes',
          },
        ],
        queryFn: () => {
          throw thrownValue;
        },
        retry: false,
      }),
    ).rejects.toBe(thrownValue);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const call = vi.mocked(Sentry.captureException).mock.calls[0];

    if (!call) {
      throw new Error('Expected Sentry captureException call');
    }

    const [capturedError, options] = call;
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe(
      'TanStack Query captured a non-Error thrown value',
    );
    expect(options).toMatchObject({
      tags: {
        area: 'tanstack-query',
      },
      extra: {
        kind: 'query',
        operationId: 'getRequiredDocumentTypes',
        nonErrorThrownType: 'empty-object',
      },
    });
  });
});
