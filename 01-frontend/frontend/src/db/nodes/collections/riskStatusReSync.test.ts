/**
 * Regression for Epic #4567 / topicId BCtV0rzxfo4:
 * "Risikohinweise korrigiert/ignoriert nicht persistent".
 *
 * A risk status change persists on the backend (proven by the AFD node-crud
 * test: POST /update returns 200 with the new status and POST /batch-nodes
 * reads it back). The revert the QA saw is a frontend re-sync artefact: the
 * on-demand DataLoader behind the node-payloads collection memoises the
 * pre-mutation payload (`status: 'open'`) forever, so the next on-demand sync
 * re-emits it and clobbers the just-persisted `corrected`/`ignored`.
 *
 * These tests pin the loader-cache contract the fix relies on: after a write,
 * the collection must re-prime the loader with the authoritative payload so a
 * subsequent load returns the new status instead of the stale one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNodePayloadsCollection } from './nodePayloads.collection';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  invalidateQueries: vi.fn(),
  vaeBatchGet: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  // Emit the single risk ref for every subset load so the collection's queryFn
  // drives the real DataLoader.
  parseWhereExpression: (
    _where: unknown,
    options: {
      handlers: { in: (field: string[], values: string[]) => void };
    },
  ) => {
    options.handlers.in(['compositeKey'], ['risks:risk-1']);
  },
  queryCollectionOptions: (options: object) => ({
    ...options,
    sync: { sync: vi.fn(() => ({})) },
  }),
}));

vi.mock('@tanstack/react-db', () => ({
  BasicIndex: class BasicIndex {},
  createCollection: (...args: unknown[]) => mocks.createCollection(...args),
}));

// Route the risks node type through the real DataLoader so we exercise its
// memoisation, but stub the network call it issues.
vi.mock('@/api-clients/backend', () => ({
  v1AdministrativeFileDraftBatchGetNodes: (...args: unknown[]) =>
    mocks.vaeBatchGet(...args),
}));

const openRisk = {
  id: 'risk-1',
  nodeType: 'risks',
  status: 'open',
  vaeNodeId: 'vae-1',
};
const correctedRisk = { ...openRisk, status: 'corrected' };

type PayloadCollection = ReturnType<typeof getNodePayloadsCollection>;

beforeEach(() => {
  mocks.createCollection.mockReset();
  mocks.createCollection.mockImplementation((options: unknown) => options);
  mocks.invalidateQueries.mockReset();
  mocks.vaeBatchGet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Runs the collection's on-demand queryFn, returning the loaded risk payload. */
async function syncRisk(): Promise<{ status: string }> {
  const options = mocks.createCollection.mock.calls.at(-1)?.[0] as {
    queryFn: (ctx: unknown) => Promise<{ status?: string }[]>;
  };
  const payloads = await options.queryFn({
    meta: { loadSubsetOptions: { where: {} } },
  });
  const payload = payloads.find((entry) => typeof entry.status === 'string');
  if (!payload || payload.status === undefined) {
    throw new Error('risk payload missing');
  }
  return { status: payload.status };
}

describe('risk status re-sync after a persisted node-crud update', () => {
  it('replays the stale cached status without a loader re-prime (reproduces the bug)', async () => {
    mocks.vaeBatchGet.mockResolvedValue({ data: { results: [openRisk] } });

    getNodePayloadsCollection('verfahren-risk-revert', 1);

    // Initial graph read caches the risk as open.
    expect((await syncRisk()).status).toBe('open');

    // Backend now persists corrected; a fresh fetch WOULD return it...
    mocks.vaeBatchGet.mockResolvedValue({ data: { results: [correctedRisk] } });

    // ...but the memoised DataLoader replays the stale open row and never
    // re-fetches, which is exactly the revert the QA observed.
    expect((await syncRisk()).status).toBe('open');
    expect(mocks.vaeBatchGet).toHaveBeenCalledTimes(1);
  });

  it('keeps the persisted status when the write re-primes the loader', async () => {
    mocks.vaeBatchGet.mockResolvedValue({ data: { results: [openRisk] } });

    const collection: PayloadCollection = getNodePayloadsCollection(
      'verfahren-risk-keep',
      1,
    );

    expect((await syncRisk()).status).toBe('open');

    // The write path re-primes the loader with the authoritative payload,
    // mirroring bulkUpdate() after a successful POST /update.
    collection.primeLoaderPayloads([
      { ...correctedRisk, compositeKey: 'risks:risk-1' } as never,
    ]);

    // The next on-demand sync now sees corrected, without another fetch.
    expect((await syncRisk()).status).toBe('corrected');
    expect(mocks.vaeBatchGet).toHaveBeenCalledTimes(1);
  });
});
