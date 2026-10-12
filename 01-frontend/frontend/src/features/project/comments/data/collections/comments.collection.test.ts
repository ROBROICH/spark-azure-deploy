import type { CommentResponse } from '@/api-clients/backend';
import { client } from '@/api-clients/backend/client.gen';
import { createLiveQueryCollection, eq } from '@tanstack/db';
import { describe, expect, it } from 'vitest';

import { commentsCollection } from './comments.collection';

const projectId = '61000000-0000-4000-8000-000000000001';
const serverComments: CommentResponse[] = Array.from(
  { length: 120 },
  (_, index) => ({
    id: `comment-${String(index).padStart(3, '0')}`,
    projectId,
    title: `Comment ${index}`,
    content: 'Content',
    processStep: 'unsorted',
    sourceRef: null,
    createdAt: new Date(Date.UTC(2026, 8, 1, 8, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 1, 8, 0, index)).toISOString(),
  }),
);

describe('commentsCollection', () => {
  it('only transfers the requested window until the reader asks for more comments', async () => {
    const original = client.getConfig();
    const transferred: string[] = [];
    client.setConfig({
      baseUrl: 'http://comments.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const page = serverComments.slice(offset, offset + limit);
        transferred.push(...page.map((comment) => comment.id));
        return Promise.resolve(Response.json(page));
      },
    });
    const projectComments = createLiveQueryCollection((q) =>
      q
        .from({ items: commentsCollection })
        .where(({ items }) => eq(items.projectId, projectId))
        .orderBy(({ items }) => items.id, 'asc')
        .limit(50),
    );
    try {
      await projectComments.preload();
      expect(projectComments.toArray.map((comment) => comment.id)).toEqual(
        serverComments.slice(0, 50).map((comment) => comment.id),
      );
      expect(new Set(transferred)).toEqual(
        new Set(serverComments.slice(0, 50).map((comment) => comment.id)),
      );

      await projectComments.utils.setWindow({ offset: 50, limit: 50 });
      expect(projectComments.toArray.map((comment) => comment.id)).toEqual(
        serverComments.slice(50, 100).map((comment) => comment.id),
      );
      expect(transferred).not.toContain('comment-100');
    } finally {
      await projectComments.cleanup();
      await commentsCollection.cleanup();
      client.setConfig(original);
    }
  });
});
