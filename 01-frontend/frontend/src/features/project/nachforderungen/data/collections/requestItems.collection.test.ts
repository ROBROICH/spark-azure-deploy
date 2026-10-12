import type { SupplementaryRequestResponse } from '@/api-clients/backend';
import { client } from '@/api-clients/backend/client.gen';
import { createLiveQueryCollection, eq } from '@tanstack/db';
import { describe, expect, it } from 'vitest';

import { requestItemsCollection } from './requestItems.collection';

const projectId = '61000000-0000-4000-8000-000000000001';
const serverRequests: SupplementaryRequestResponse[] = Array.from(
  { length: 120 },
  (_, index) => ({
    id: `61000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    projectId,
    title: `Request ${index}`,
    reason: 'Reason',
    priority: 'must',
    sourceRef: null,
    includedInLetter: true,
    topicId: null,
    documentId: null,
    createdAt: new Date(Date.UTC(2026, 8, 1, 8, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 1, 8, 0, index)).toISOString(),
  }),
);

describe('requestItemsCollection', () => {
  it('only transfers a requested window until the reader asks for more requests', async () => {
    const original = client.getConfig();
    const transferred: string[] = [];
    client.setConfig({
      baseUrl: 'http://requests.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const page = serverRequests.slice(offset, offset + limit);
        transferred.push(...page.map((item) => item.id));
        return Promise.resolve(Response.json(page));
      },
    });

    const projectRequests = createLiveQueryCollection((q) =>
      q
        .from({ items: requestItemsCollection })
        .where(({ items }) => eq(items.projectId, projectId))
        .orderBy(({ items }) => items.createdAt, 'asc')
        .orderBy(({ items }) => items.id, 'asc')
        .limit(50),
    );
    try {
      await projectRequests.preload();
      expect(projectRequests.toArray.map((item) => item.id)).toEqual(
        serverRequests.slice(0, 50).map((item) => item.id),
      );
      expect(new Set(transferred)).toEqual(
        new Set(serverRequests.slice(0, 50).map((item) => item.id)),
      );
      await projectRequests.utils.setWindow({ offset: 50, limit: 50 });
      expect(projectRequests.toArray.map((item) => item.id)).toEqual(
        serverRequests.slice(50, 100).map((item) => item.id),
      );
    } finally {
      await projectRequests.cleanup();
      await requestItemsCollection.cleanup();
      client.setConfig(original);
    }
  });
});
