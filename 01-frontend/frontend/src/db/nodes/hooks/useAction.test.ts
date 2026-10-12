import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useAction } from './useAction';

const mocks = vi.hoisted(() => ({
  payloadsCollection: {
    delete: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  nodesCollection: {},
  transact: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      db: {
        payloadsCollection: mocks.payloadsCollection,
        nodesCollection: mocks.nodesCollection,
      },
      projectVersion: 3,
    }),
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@/db/nodes/transactions/payloadUpdate.transaction', () => ({
  createTransactionHelper: () => mocks.transact,
}));

describe('useAction', () => {
  it('deletes node payloads by the payload composite key', () => {
    const nodeRef = { id: 'topic-1', nodeType: 'topic' } as const;
    const node = {
      ...nodeRef,
      compositeKey: toCompositeKey(nodeRef),
    } as NodePayloadByType<'topic'>;

    const { result } = renderHook(() => useAction());

    result.current.delete(node);

    expect(mocks.payloadsCollection.delete).toHaveBeenCalledWith(
      'topic:topic-1',
    );
  });
});
