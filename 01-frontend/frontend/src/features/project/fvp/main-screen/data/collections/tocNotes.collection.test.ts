import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TocNotesWithStatusResponse } from '@/api-clients/fcs-module';
import {
  getTocNotesResponseQueryOptions,
  tocNotesCollection,
} from './tocNotes.collection';

type ParsedLoadSubsetOptions = {
  filters: { field: string[]; value: string }[];
};

type QueryFnContext = {
  meta?: { loadSubsetOptions?: Record<string, unknown> };
};

type TocNotesHandlers = {
  queryFn: (ctx: QueryFnContext) => Promise<Record<string, unknown>[]>;
};

const mocks = vi.hoisted(() => ({
  getTocNotes: vi.fn(),
  fetchQuery: vi.fn(),
  parseLoadSubsetOptions: vi.fn(
    (..._args: unknown[]): ParsedLoadSubsetOptions => ({ filters: [] }),
  ),
}));

vi.mock('@/api-clients/fcs-module', () => ({
  createProjectTocNotesProjectIdTocNotesPost: vi.fn(),
  getProjectTocNotesProjectIdTocNotesGet: (...args: unknown[]) =>
    mocks.getTocNotes(...args),
  updateProjectTocNoteResolvedProjectIdTocNotesNoteIdPatch: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    fetchQuery: (...args: unknown[]) => mocks.fetchQuery(...args),
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  parseLoadSubsetOptions: (...args: unknown[]) =>
    mocks.parseLoadSubsetOptions(...args),
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => ({ ...options, utils: {} }),
}));

const handlers = tocNotesCollection as unknown as TocNotesHandlers;

const projectId = 'project-1';
const queryFnContext: QueryFnContext = {
  meta: { loadSubsetOptions: { projectId } },
};

const runTocNotesQuery = () => {
  const queryOptions = getTocNotesResponseQueryOptions(projectId);
  return (queryOptions.queryFn as () => Promise<TocNotesWithStatusResponse>)();
};

describe('getTocNotesResponseQueryOptions', () => {
  beforeEach(() => {
    mocks.getTocNotes.mockReset();
  });

  it('returns an empty response for bodyless successful reads', async () => {
    mocks.getTocNotes.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    });

    await expect(runTocNotesQuery()).resolves.toEqual({
      status: null,
      notes: [],
    });
  });

  it('returns an empty response for null successful reads', async () => {
    mocks.getTocNotes.mockResolvedValue({
      data: null,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    await expect(runTocNotesQuery()).resolves.toEqual({
      status: null,
      notes: [],
    });
  });

  it('throws generated-client errors instead of treating them as empty notes', async () => {
    mocks.getTocNotes.mockResolvedValue({
      data: undefined,
      error: { detail: 'invalid project id' },
      response: new Response(null, { status: 422 }),
    });

    await expect(runTocNotesQuery()).rejects.toThrow(
      'Request failed with status 422',
    );
  });
});

describe('tocNotesCollection queryFn projection', () => {
  beforeEach(() => {
    mocks.parseLoadSubsetOptions.mockReset();
    mocks.fetchQuery.mockReset();
  });

  it('returns an empty list when no project id can be resolved', async () => {
    mocks.parseLoadSubsetOptions.mockReturnValue({ filters: [] });

    const result = await handlers.queryFn(queryFnContext);

    expect(result).toEqual([]);
    expect(mocks.fetchQuery).not.toHaveBeenCalled();
  });

  it('maps raw API notes into local TOC note rows', async () => {
    mocks.parseLoadSubsetOptions.mockReturnValue({
      filters: [{ field: ['projectId'], value: projectId }],
    });
    mocks.fetchQuery.mockResolvedValue({
      status: null,
      notes: [
        {
          id: 'note-1',
          project_id: projectId,
          content: 'Unterlage 1',
          is_resolved: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    });

    const result = await handlers.queryFn(queryFnContext);

    expect(result).toEqual([
      {
        id: 'note-1',
        projectId,
        content: 'Unterlage 1',
        isResolved: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);
  });
});
