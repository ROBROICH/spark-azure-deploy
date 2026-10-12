import { createClient } from '@/api-clients/backend/client/client.gen';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import {
  subscribeProjectVersionConflict,
  type ProjectVersionConflict,
} from './projectVersionConflict';
import { configureProjectVersionConflictInterceptors } from './projectVersionConflictInterceptors';

type CapturedErrorInterceptor = (
  error: unknown,
  response: Response | undefined,
  request: Request | undefined,
  options: {
    body?: unknown;
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
  },
) => unknown | Promise<unknown>;

const createInterceptorHarness = () => {
  const interceptors: CapturedErrorInterceptor[] = [];

  return {
    client: {
      interceptors: {
        error: {
          use: (fn: CapturedErrorInterceptor) => {
            interceptors.push(fn);
            return interceptors.length - 1;
          },
        },
      },
    },
    interceptors,
  };
};

const CONFLICT_STATUS = 409;

const conflictResponse = () => new Response(null, { status: CONFLICT_STATUS });
const okErrorResponse = (status: number) => new Response(null, { status });

const NOT_LATEST_ERROR = { code: 'VersionNotLatestError' } as const;

const captureConflicts = () => {
  const conflicts: ProjectVersionConflict[] = [];
  const unsubscribe = subscribeProjectVersionConflict((conflict) => {
    conflicts.push(conflict);
  });
  return { conflicts, unsubscribe };
};

describe('configureProjectVersionConflictInterceptors (direct)', () => {
  it('emits a conflict event and returns a handled error for a 409 conflict', () => {
    const { client, interceptors } = createInterceptorHarness();
    const { conflicts, unsubscribe } = captureConflicts();

    configureProjectVersionConflictInterceptors([client]);

    const result = interceptors[0]?.(
      NOT_LATEST_ERROR,
      conflictResponse(),
      new Request('https://example.test'),
      { body: { projectId: 'project-1' } },
    );

    unsubscribe();

    expect(isHandledProjectVersionConflictError(result)).toBe(true);
    expect(conflicts).toEqual([{ kind: 'not_latest', projectId: 'project-1' }]);
  });

  it('returns the shared handled conflict error type without throwing', () => {
    const { client, interceptors } = createInterceptorHarness();
    const { unsubscribe } = captureConflicts();

    configureProjectVersionConflictInterceptors([client]);

    expect.assertions(2);
    const result = interceptors[0]?.(
      { detail: 'Project version is locked' },
      conflictResponse(),
      new Request('https://example.test'),
      { path: { projectId: 'project-1' } },
    );
    unsubscribe();

    expect(result).not.toBeInstanceOf(Promise);
    expect(isHandledProjectVersionConflictError(result)).toBe(true);
  });

  it('returns unrelated errors unchanged and emits no event', () => {
    const { client, interceptors } = createInterceptorHarness();
    const { conflicts, unsubscribe } = captureConflicts();
    const error = new Error('network failed');

    configureProjectVersionConflictInterceptors([client]);

    const result = interceptors[0]?.(
      error,
      okErrorResponse(500),
      new Request('https://example.test'),
      {},
    );
    unsubscribe();

    expect(result).toBe(error);
    expect(conflicts).toEqual([]);
  });

  describe('response-status gating', () => {
    it('keeps a conflict-shaped non-409 response as a normal error', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        okErrorResponse(400),
        new Request('https://example.test'),
        { body: { projectId: 'project-1' } },
      );
      unsubscribe();

      expect(result).toBe(NOT_LATEST_ERROR);
      expect(conflicts).toEqual([]);
    });

    it('keeps a conflict-shaped error with no response as a normal error', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        undefined,
        new Request('https://example.test'),
        { body: { projectId: 'project-1' } },
      );
      unsubscribe();

      expect(result).toBe(NOT_LATEST_ERROR);
      expect(conflicts).toEqual([]);
    });

    it('handles a conflict on a 409 response', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        conflictResponse(),
        new Request('https://example.test'),
        { body: { projectId: 'project-1' } },
      );
      unsubscribe();

      expect(isHandledProjectVersionConflictError(result)).toBe(true);
      expect(conflicts).toEqual([
        { kind: 'not_latest', projectId: 'project-1' },
      ]);
    });
  });

  describe('project-id extraction', () => {
    it.each([
      {
        name: 'path option',
        options: { path: { projectId: 'project-path' } },
        expected: 'project-path',
      },
      {
        name: 'query option',
        options: { query: { projectId: 'project-query' } },
        expected: 'project-query',
      },
      {
        name: 'body option',
        options: { body: { projectId: 'project-body' } },
        expected: 'project-body',
      },
    ])('derives the project id from the $name', ({ options, expected }) => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        conflictResponse(),
        new Request('https://example.test'),
        options,
      );
      unsubscribe();

      expect(isHandledProjectVersionConflictError(result)).toBe(true);
      expect(conflicts).toEqual([{ kind: 'not_latest', projectId: expected }]);
    });

    it('derives the project id from the trusted request URL', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        conflictResponse(),
        new Request('https://example.test/verfahren/project-url/details'),
        {},
      );
      unsubscribe();

      expect(isHandledProjectVersionConflictError(result)).toBe(true);
      expect(conflicts).toEqual([
        { kind: 'not_latest', projectId: 'project-url' },
      ]);
    });

    it('returns the original error and emits no event when no project id can be derived', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        conflictResponse(),
        new Request('https://example.test/unrelated/path'),
        {},
      );
      unsubscribe();

      expect(result).toBe(NOT_LATEST_ERROR);
      expect(conflicts).toEqual([]);
    });

    it('does not fall back to window.location when the project is ambiguous', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();
      const originalPathname = window.location.pathname;
      window.history.pushState({}, '', '/verfahren/route-project/overview');

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        NOT_LATEST_ERROR,
        conflictResponse(),
        new Request('https://example.test/no-project-here'),
        {},
      );
      unsubscribe();
      window.history.pushState({}, '', originalPathname);

      // The current-route fallback was removed: an ambiguous request must not
      // emit a conflict for the route the user happens to be on.
      expect(result).toBe(NOT_LATEST_ERROR);
      expect(conflicts).toEqual([]);
    });

    it('uses request-context project id when the error payload disagrees', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        { code: 'VersionNotLatestError', projectId: 'evil-project' },
        conflictResponse(),
        new Request('https://example.test'),
        { path: { projectId: 'trusted-project' } },
      );
      unsubscribe();

      // The mismatched payload id disagrees with the trusted request context, so
      // the interceptor fails closed and returns the original error.
      expect(result).not.toBe(undefined);
      expect(isHandledProjectVersionConflictError(result)).toBe(false);
      expect(conflicts).toEqual([]);
    });

    it('uses the error payload project id only as a fallback', () => {
      const { client, interceptors } = createInterceptorHarness();
      const { conflicts, unsubscribe } = captureConflicts();

      configureProjectVersionConflictInterceptors([client]);

      const result = interceptors[0]?.(
        { code: 'VersionNotLatestError', projectId: 'payload-project' },
        conflictResponse(),
        new Request('https://example.test/no-project-here'),
        {},
      );
      unsubscribe();

      expect(isHandledProjectVersionConflictError(result)).toBe(true);
      expect(conflicts).toEqual([
        { kind: 'not_latest', projectId: 'payload-project' },
      ]);
    });
  });
});

describe('configureProjectVersionConflictInterceptors (real generated client)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupGeneratedClient = (status: number) => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 'VersionNotLatestError' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const client = createClient({
      baseUrl: 'https://example.test',
      fetch: fetchImpl as unknown as typeof fetch,
    });

    configureProjectVersionConflictInterceptors([client]);

    return { client };
  };

  it('returns the handled error and emits exactly one conflict event when throwOnError is false', async () => {
    const { client } = setupGeneratedClient(CONFLICT_STATUS);
    const { conflicts, unsubscribe } = captureConflicts();

    const result = await client.get({
      url: '/verfahren/{verfahrenId}/data',
      path: { verfahrenId: 'project-1' },
      throwOnError: false,
    });

    unsubscribe();

    expect(result.data).toBeUndefined();
    expect(isHandledProjectVersionConflictError(result.error)).toBe(true);
    expect(result.response?.status).toBe(CONFLICT_STATUS);
    expect(conflicts).toEqual([{ kind: 'not_latest', projectId: 'project-1' }]);
  });

  it('throws the handled error when throwOnError is true', async () => {
    const { client } = setupGeneratedClient(CONFLICT_STATUS);
    const { conflicts, unsubscribe } = captureConflicts();

    let thrown: unknown;
    try {
      await client.get({
        url: '/verfahren/{verfahrenId}/data',
        path: { verfahrenId: 'project-1' },
        throwOnError: true,
      });
    } catch (error) {
      thrown = error;
    }

    unsubscribe();

    expect(isHandledProjectVersionConflictError(thrown)).toBe(true);
    expect(conflicts).toEqual([{ kind: 'not_latest', projectId: 'project-1' }]);
  });

  it('does not handle a conflict-shaped non-409 response from the generated client', async () => {
    const { client } = setupGeneratedClient(400);
    const { conflicts, unsubscribe } = captureConflicts();

    const result = await client.get({
      url: '/verfahren/{verfahrenId}/data',
      path: { verfahrenId: 'project-1' },
      throwOnError: false,
    });

    unsubscribe();

    expect(isHandledProjectVersionConflictError(result.error)).toBe(false);
    expect(conflicts).toEqual([]);
  });
});
