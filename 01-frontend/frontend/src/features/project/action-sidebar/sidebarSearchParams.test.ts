import { describe, expect, it } from 'vitest';
import { actionSidebarSearchSchema } from './sidebarSearchParams';

describe('actionSidebarSearchSchema', () => {
  it('canonicalizes a malformed scalar field to undefined instead of throwing', () => {
    // A stale/garbage sidebarPanel value must not throw and trip the route error
    // fallback; it should resolve to undefined.
    expect(() =>
      actionSidebarSearchSchema.parse({ sidebarPanel: 'not-a-real-panel' }),
    ).not.toThrow();

    expect(
      actionSidebarSearchSchema.parse({ sidebarPanel: 'not-a-real-panel' })
        .sidebarPanel,
    ).toBeUndefined();
  });

  it('canonicalizes a malformed init-item array to undefined instead of throwing', () => {
    const parsed = actionSidebarSearchSchema.parse({
      newCommentInitItems: 'totally-not-an-array',
    });

    expect(parsed.newCommentInitItems).toBeUndefined();
  });

  it('drops malformed entries but keeps valid ones in init-item arrays', () => {
    const parsed = actionSidebarSearchSchema.parse({
      newCommentInitItems: [
        { title: 'Valid draft' },
        { notATitle: 42 },
        { title: 'Second valid draft', content: 'Body' },
      ],
    });

    expect(parsed.newCommentInitItems).toEqual([
      { title: 'Valid draft' },
      { title: 'Second valid draft', content: 'Body' },
    ]);
  });

  it('keeps valid values untouched', () => {
    const parsed = actionSidebarSearchSchema.parse({
      sidebarPanel: 'comments',
      deleteCommentId: 'comment-1',
    });

    expect(parsed.sidebarPanel).toBe('comments');
    expect(parsed.deleteCommentId).toBe('comment-1');
  });
});
