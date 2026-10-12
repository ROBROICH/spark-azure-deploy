import { renderHook } from '@testing-library/react';
import type * as TanstackReactDb from '@tanstack/react-db';
import type * as TanstackReactRouter from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeRef } from '../types';
import { useLiveNode, useLiveNodes } from './useLiveNodes';
import { useNode, useNodes } from './useNodes';
import { useLiveNodesByType, useNodesByType } from './useNodesByType';

const graphMocks = vi.hoisted(() => ({
  getNodesByType: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  currentPayloadsCollection: { id: 'payloads-1' } as Record<string, unknown>,
  useLiveQuery: vi.fn(),
  useLiveSuspenseQuery: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactRouter>();

  return {
    ...actual,
    getRouteApi: () => ({
      useLoaderData: () => ({
        db: {
          payloadsCollection: mocks.currentPayloadsCollection,
        },
      }),
    }),
  };
});

vi.mock('@tanstack/react-db', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactDb>();

  return {
    ...actual,
    inArray: vi.fn(() => ({})),
    useLiveQuery: (...args: unknown[]) => mocks.useLiveQuery(...args),
    useLiveSuspenseQuery: (...args: unknown[]) =>
      mocks.useLiveSuspenseQuery(...args),
  };
});

vi.mock('./useGraph', () => ({
  useGraph: () => ({
    getNodesByType: graphMocks.getNodesByType,
  }),
}));

describe('node query hooks', () => {
  beforeEach(() => {
    mocks.currentPayloadsCollection = { id: 'payloads-1' };
    mocks.useLiveQuery.mockReset();
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [],
      state: null,
    });
    mocks.useLiveSuspenseQuery.mockReset();
    mocks.useLiveSuspenseQuery.mockReturnValue({
      collection: null,
      data: [],
      state: null,
    });
    graphMocks.getNodesByType.mockReset();
    graphMocks.getNodesByType.mockReturnValue([
      { id: 'topic-1', nodeType: 'topic' },
    ]);
  });

  it('tracks the active payload collection in useNode query deps', () => {
    const { rerender } = renderHook(() =>
      useNode({ id: 'topic-1', nodeType: 'topic' }),
    );

    const [, firstDeps] = mocks.useLiveSuspenseQuery.mock.calls[0] as [
      unknown,
      unknown[],
    ];

    mocks.currentPayloadsCollection = { id: 'payloads-2' };

    rerender();

    const [, secondDeps] = mocks.useLiveSuspenseQuery.mock.calls[1] as [
      unknown,
      unknown[],
    ];

    expect(firstDeps[0]).toEqual({ id: 'payloads-1' });
    expect(secondDeps[0]).toEqual({ id: 'payloads-2' });
  });

  it('tracks the active payload collection in useNodes query deps', () => {
    const { rerender } = renderHook(() =>
      useNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    const [, firstDeps] = mocks.useLiveSuspenseQuery.mock.calls[0] as [
      unknown,
      unknown[],
    ];

    mocks.currentPayloadsCollection = { id: 'payloads-2' };

    rerender();

    const [, secondDeps] = mocks.useLiveSuspenseQuery.mock.calls[1] as [
      unknown,
      unknown[],
    ];

    expect(firstDeps[0]).toEqual({ id: 'payloads-1' });
    expect(secondDeps[0]).toEqual({ id: 'payloads-2' });
  });

  it('scopes useNodes data to the current node refs', () => {
    mocks.useLiveSuspenseQuery.mockReturnValue({
      collection: null,
      data: [
        {
          compositeKey: 'topic:stale-topic',
          id: 'stale-topic',
          nodeType: 'topic',
        },
        {
          compositeKey: 'topic:topic-1',
          id: 'topic-1',
          nodeType: 'topic',
        },
      ],
      state: null,
    });

    const { result } = renderHook(() =>
      useNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.data).toEqual([
      {
        compositeKey: 'topic:topic-1',
        id: 'topic-1',
        nodeType: 'topic',
      },
    ]);
  });

  it('updates useNodes data order when the current node refs reorder', () => {
    mocks.useLiveSuspenseQuery.mockReturnValue({
      collection: null,
      data: [
        {
          compositeKey: 'topic:topic-1',
          id: 'topic-1',
          nodeType: 'topic',
        },
        {
          compositeKey: 'topic:topic-2',
          id: 'topic-2',
          nodeType: 'topic',
        },
      ],
      state: null,
    });
    let nodeRefs: NodeRef[] = [
      { id: 'topic-1', nodeType: 'topic' },
      { id: 'topic-2', nodeType: 'topic' },
    ];

    const { rerender, result } = renderHook(() => useNodes(nodeRefs));

    expect(result.current.data.map((payload) => payload.id)).toEqual([
      'topic-1',
      'topic-2',
    ]);

    nodeRefs = [
      { id: 'topic-2', nodeType: 'topic' },
      { id: 'topic-1', nodeType: 'topic' },
    ];
    rerender();

    expect(result.current.data.map((payload) => payload.id)).toEqual([
      'topic-2',
      'topic-1',
    ]);
  });

  it('tracks the active payload collection in useLiveNode query deps', () => {
    const { rerender } = renderHook(() =>
      useLiveNode({ id: 'topic-1', nodeType: 'topic' }),
    );

    const [, firstDeps] = mocks.useLiveQuery.mock.calls[0] as [
      unknown,
      unknown[],
    ];

    mocks.currentPayloadsCollection = { id: 'payloads-2' };

    rerender();

    const [, secondDeps] = mocks.useLiveQuery.mock.calls[1] as [
      unknown,
      unknown[],
    ];

    expect(firstDeps[0]).toEqual({ id: 'payloads-1' });
    expect(secondDeps[0]).toEqual({ id: 'payloads-2' });
  });

  it('tracks the active payload collection in useLiveNodes query deps', () => {
    const { rerender } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    const [, firstDeps] = mocks.useLiveQuery.mock.calls[0] as [
      unknown,
      unknown[],
    ];

    mocks.currentPayloadsCollection = { id: 'payloads-2' };

    rerender();

    const [, secondDeps] = mocks.useLiveQuery.mock.calls[1] as [
      unknown,
      unknown[],
    ];

    expect(firstDeps[0]).toEqual({ id: 'payloads-1' });
    expect(secondDeps[0]).toEqual({ id: 'payloads-2' });
  });

  it('keeps useLiveNodes loading while the current live query is resolving', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [],
      isLoading: true,
      state: null,
      status: 'loading',
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('does not keep useLiveNodes loading after a settled query returns no payloads', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [],
      isLoading: false,
      state: null,
      status: 'ready',
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('uses the suspense node query for useNodesByType', () => {
    renderHook(() => useNodesByType('topic'));

    expect(graphMocks.getNodesByType).toHaveBeenCalledWith('topic');
    expect(mocks.useLiveSuspenseQuery).toHaveBeenCalledTimes(1);
    expect(mocks.useLiveQuery).not.toHaveBeenCalled();
  });

  it('uses the non-suspending live node query for useLiveNodesByType', () => {
    renderHook(() => useLiveNodesByType('topic'));

    expect(graphMocks.getNodesByType).toHaveBeenCalledWith('topic');
    expect(mocks.useLiveQuery).toHaveBeenCalledTimes(1);
    expect(mocks.useLiveSuspenseQuery).not.toHaveBeenCalled();
  });

  it('passes through useLiveQuery loading even when rows are already available', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [
        {
          compositeKey: 'topic:topic-1',
          id: 'topic-1',
          nodeType: 'topic',
        },
      ],
      isLoading: true,
      state: null,
      status: 'loading',
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.data).toEqual([
      {
        compositeKey: 'topic:topic-1',
        id: 'topic-1',
        nodeType: 'topic',
      },
    ]);
    expect(result.current.isLoading).toBe(true);
  });

  it('uses the useLiveQuery loading state instead of deriving loading from status', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [],
      isLoading: false,
      state: null,
      status: 'idle',
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.isLoading).toBe(false);
  });

  it('scopes useLiveNodes data to the current node refs', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [
        {
          compositeKey: 'topic:stale-topic-1',
          id: 'stale-topic-1',
          nodeType: 'topic',
        },
        {
          compositeKey: 'topic:stale-topic-2',
          id: 'stale-topic-2',
          nodeType: 'topic',
        },
        {
          compositeKey: 'topic:topic-1',
          id: 'topic-1',
          nodeType: 'topic',
        },
      ],
      isLoading: false,
      state: null,
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.data).toEqual([
      {
        compositeKey: 'topic:topic-1',
        id: 'topic-1',
        nodeType: 'topic',
      },
    ]);
  });

  it('updates useLiveNodes data order when the current node refs reorder', () => {
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [
        {
          compositeKey: 'topic:topic-1',
          id: 'topic-1',
          nodeType: 'topic',
        },
        {
          compositeKey: 'topic:topic-2',
          id: 'topic-2',
          nodeType: 'topic',
        },
      ],
      isLoading: false,
      state: null,
    });
    let nodeRefs: NodeRef[] = [
      { id: 'topic-1', nodeType: 'topic' },
      { id: 'topic-2', nodeType: 'topic' },
    ];

    const { rerender, result } = renderHook(() => useLiveNodes(nodeRefs));

    expect(result.current.data.map((payload) => payload.id)).toEqual([
      'topic-1',
      'topic-2',
    ]);

    nodeRefs = [
      { id: 'topic-2', nodeType: 'topic' },
      { id: 'topic-1', nodeType: 'topic' },
    ];
    rerender();

    expect(result.current.data.map((payload) => payload.id)).toEqual([
      'topic-2',
      'topic-1',
    ]);
  });

  it('does not read directly from the source payload collection', () => {
    const getPayload = vi.fn(() => ({
      compositeKey: 'topic:topic-1',
      id: 'topic-1',
      nodeType: 'topic',
    }));
    mocks.currentPayloadsCollection = {
      id: 'payloads-1',
      get: getPayload,
    };
    mocks.useLiveQuery.mockReturnValue({
      collection: null,
      data: [],
      isLoading: false,
      state: null,
    });

    const { result } = renderHook(() =>
      useLiveNodes([{ id: 'topic-1', nodeType: 'topic' }]),
    );

    expect(result.current.data).toEqual([]);
    expect(getPayload).not.toHaveBeenCalled();
  });
});
