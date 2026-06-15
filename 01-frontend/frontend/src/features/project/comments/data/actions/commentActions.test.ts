import { createTransaction } from '@tanstack/db';
import { describe, expect, it, vi } from 'vitest';

import { commentsCollection } from '../collections/comments.collection';
import { addComment } from './commentActions';

describe('addComment', () => {
  it('creates comments without an optimistic placeholder row', async () => {
    const insert = vi
      .spyOn(commentsCollection, 'insert')
      .mockReturnValue(
        createTransaction({ mutationFn: () => Promise.resolve() }).mutate(
          () => undefined,
        ),
      );

    await addComment(
      'project-1',
      'Title',
      'Content',
      'formalCompletenessCheck',
      { type: 'tableOfContents', itemId: 'toc-1' },
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        title: 'Title',
        content: 'Content',
        processStep: 'formalCompletenessCheck',
        sourceRef: { type: 'tableOfContents', itemId: 'toc-1' },
      }),
      { optimistic: false },
    );
  });
});
